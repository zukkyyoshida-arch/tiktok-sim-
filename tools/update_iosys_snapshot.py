"""
update_iosys_snapshot.py — 販売相場（イオシス販売）スナップショットの更新スクリプト。

■ 何のためのスクリプトか
中古相場タブは、買取価格（kaitori.py）と同様に「同梱スナップショット方式」で
販売価格（iosys.py）も表示する。ライブ取得は「🔄 相場を再取得」ボタンを押した
ときだけ行い、既定ではこのスナップショットを表示することで表示を即時化する。

■ 使い方
    cd <リポジトリのルート>
    python3 tools/update_iosys_snapshot.py [--limit N]

    data_snapshots/iosys_sale_snapshot.json が上書きされるので、
    差分を確認してからコミットする:
        git diff --stat data_snapshots/iosys_sale_snapshot.json
        git add data_snapshots/iosys_sale_snapshot.json
        git commit -m "chore: 販売相場スナップショットを更新"

    --limit N を付けると iosys.BUILTIN_MODEL_LIST の先頭N機種だけ取得する
    （動作確認用。本番更新には付けない）。

■ 取得の流れ（app.py の _fetch_sale_prices と同じロジック）
1. 全機種を ThreadPoolExecutor で6並列取得（search_with_fallback + filter_strict）。
   ジッター・リトライは iosys.py 側（_jitter_sleep / _get_with_retry）で効く。
2. 1回目で0件だった機種だけ、直列で1回だけ再試行する
   （一斉アクセスで絞られただけなら、間隔を空けた再試行で取れることがある）。
3. それでも0件/エラーの機種は、既存スナップショットに前回値があればそれを温存し、
   警告として一覧表示する（買取スナップショットの温存パターンと同じ）。

■ 失敗したとき
1機種も取得できなかった場合（全滅）は、既存ファイルを壊さずに中断する。
書き込みは一時ファイル→os.replace のアトミック処理。

■ 更新の目安
販売価格は在庫の入れ替わりとともに動くため、月1回程度の更新を推奨。
本番のUIには「YYYY-MM-DD HH:MM時点のスナップショット」と取得日時が表示される。
"""
import argparse
import concurrent.futures
import json
import os
import sys
from datetime import datetime

# リポジトリのルートをimportパスに追加（tools/ から実行されるため）
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import iosys  # noqa: E402

SNAPSHOT_PATH = iosys.SNAPSHOT_PATH

# app.py の IOSYS_MAX_WORKERS / IOSYS_RETRY_WORKERS と同じ値。
# 本番と違い住宅IPからの実行前提だが、イオシス側への配慮として同じ並列数に揃える。
FETCH_MAX_WORKERS = 6
RETRY_WORKERS = 1


def load_existing(path=SNAPSHOT_PATH):
    """既存スナップショットを読む（無ければNone）。"""
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _fetch_one_model(model_name):
    """1機種分の販売相場を取得する（app.py の _fetch_one_model と同じロジック）。"""
    items, used_query, error = iosys.search_with_fallback(model_name, max_pages=2)
    strict_items = iosys.filter_strict(items, iosys.normalize_model_name(model_name))
    return model_name, {
        "items": strict_items,
        "used_query": used_query,
        "error": error,
    }


def fetch_all(model_names):
    """全機種の販売相場を並列取得し、0件だった機種だけ直列で1回再試行する。

    戻り値: dict[機種名, {"items": [...], "used_query": str, "error": str|None}]
    """
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=FETCH_MAX_WORKERS) as executor:
        future_map = {executor.submit(_fetch_one_model, name): name for name in model_names}
        for i, future in enumerate(concurrent.futures.as_completed(future_map), start=1):
            name = future_map[future]
            try:
                model_name, data = future.result()
                results[model_name] = data
            except Exception as e:
                results[name] = {"items": [], "used_query": name, "error": str(e)}
            print(f"  [{i}/{len(model_names)}] {name}", flush=True)

    zero_hit = [
        name for name in model_names
        if name in results and not results[name]["items"] and not results[name]["error"]
    ]
    if zero_hit:
        print(f"0件だった{len(zero_hit)}機種を直列で再試行します…")
        with concurrent.futures.ThreadPoolExecutor(max_workers=RETRY_WORKERS) as executor:
            retry_map = {executor.submit(_fetch_one_model, name): name for name in zero_hit}
            for future in concurrent.futures.as_completed(retry_map):
                name = retry_map[future]
                try:
                    model_name, data = future.result()
                    if data["items"]:
                        data["retried"] = True
                        results[model_name] = data
                except Exception:
                    pass

    return {name: results[name] for name in model_names if name in results}


def build_snapshot(fetch_results, previous=None):
    """取得結果からスナップショットのdictを組み立てる。

    0件/エラーだった機種は、既存スナップショットに前回値（1件以上のitems）が
    あればそれを温存する（買取スナップショットの温存パターンと同じ）。

    戻り値: (snapshot: dict, carried_over: list[str], zero_hit: list[str])
    """
    previous_results = (previous or {}).get("results") or {}

    merged_results = {}
    carried_over = []
    zero_hit = []

    for model_name, data in fetch_results.items():
        if data.get("items"):
            merged_results[model_name] = {
                "items": data["items"],
                "used_query": data["used_query"],
            }
            continue

        prev = previous_results.get(model_name)
        if prev and prev.get("items"):
            merged_results[model_name] = prev
            carried_over.append(model_name)
        else:
            # 温存する前回値も無い場合、0件として結果に残す（zero_hit扱いは呼び出し側の従来ロジックに委ねる）
            merged_results[model_name] = {
                "items": [],
                "used_query": data.get("used_query", model_name),
            }
            zero_hit.append(model_name)

    snapshot = {
        "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "https://iosys.co.jp/items",
        "note": (
            "中古相場タブの既定表示元。ライブ取得は「🔄 相場を再取得」ボタンを"
            "押したときのみ行う。更新は tools/update_iosys_snapshot.py。"
        ),
        "model_count": len(merged_results),
        "carried_over_models": carried_over,
        "zero_hit_models": zero_hit,
        "results": merged_results,
    }
    return snapshot, carried_over, zero_hit


def main():
    parser = argparse.ArgumentParser(description="イオシス販売相場スナップショットの更新")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="先頭N機種だけ取得する（動作確認用）",
    )
    args = parser.parse_args()

    model_names = []
    seen = set()
    for name in iosys.BUILTIN_MODEL_LIST:
        norm = iosys.normalize_model_name(name)
        if norm and norm not in seen:
            seen.add(norm)
            model_names.append(norm)

    if args.limit is not None:
        model_names = model_names[: args.limit]

    print(f"イオシス販売相場を取得しています…（{len(model_names)}機種）")
    fetch_results = fetch_all(model_names)

    success_count = sum(1 for d in fetch_results.values() if d.get("items"))
    if success_count == 0:
        print("NG: 1機種も取得できませんでした。既存スナップショットは変更しません。")
        return 1

    previous = load_existing()
    snapshot, carried_over, zero_hit = build_snapshot(fetch_results, previous)

    tmp_path = SNAPSHOT_PATH + ".tmp"
    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp_path, SNAPSHOT_PATH)

    print(f"OK: {snapshot['model_count']} 機種を書き出しました → {SNAPSHOT_PATH}")
    print(f"    取得日時: {snapshot['fetched_at']}")
    print(f"    取得成功: {success_count} 機種")
    if carried_over:
        print(f"    既存スナップショットから温存: {len(carried_over)} 機種")
        for m in carried_over:
            print("      ", m)
    if zero_hit:
        print(f"    0件（温存も無し）: {len(zero_hit)} 機種")
        for m in zero_hit:
            print("      ", m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
