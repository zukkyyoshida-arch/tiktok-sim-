"""
update_kaitori_snapshot.py — 買取価格スナップショットの更新スクリプト。

■ 何のためのスクリプトか
本番（Streamlit Cloud）はAWSデータセンターのIPから通信するため、
イオシス買取（k-tai-iosys.com）に全ブランド HTTP 403 で弾かれる。
住宅IPのローカル環境からは200で取得できるため、ここで取ったスナップショットを
リポジトリに同梱し、本番ではそれをフォールバックとして使う。

■ 使い方（必ず自宅などの住宅IP環境で実行すること）
    cd <リポジトリのルート>
    python3 tools/update_kaitori_snapshot.py

    data_snapshots/kaitori_snapshot.json が上書きされるので、
    差分を確認してからコミットする:
        git diff --stat data_snapshots/kaitori_snapshot.json
        git add data_snapshots/kaitori_snapshot.json
        git commit -m "chore: 買取スナップショットを更新"

■ 更新の目安
買取価格は相場とともに動くため、月1回程度の更新を推奨。
本番のUIには「YYYY-MM-DD 時点のスナップショット」と取得日が表示される。

■ 失敗したとき
一部ブランドだけ失敗した場合は、そのブランドを既存スナップショットの内容で
温存したうえで警告を出す（全滅時は既存ファイルを壊さずに中断する）。
"""
import json
import os
import sys
from datetime import datetime

# リポジトリのルートをimportパスに追加（tools/ から実行されるため）
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import kaitori  # noqa: E402

SNAPSHOT_PATH = os.path.join(_REPO_ROOT, "data_snapshots", "kaitori_snapshot.json")


def load_existing(path=SNAPSHOT_PATH):
    """既存スナップショットを読む（無ければNone）。"""
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def build_snapshot(rows, errors, previous=None):
    """取得結果からスナップショットのdictを組み立てる。

    失敗したブランドは、既存スナップショットに値があればそれを温存する
    （403等で一部だけ落ちたときに、そのブランドを空にしてしまわないため）。
    """
    fetched_brands = {r["brand"] for r in rows}
    merged_rows = list(rows)
    carried_over = []

    if previous:
        for row in previous.get("rows", []):
            brand = row.get("brand")
            if brand and brand not in fetched_brands:
                merged_rows.append(row)
                if brand not in carried_over:
                    carried_over.append(brand)

    return {
        "fetched_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "https://k-tai-iosys.com/pricelist/smartphone/<brand>/",
        "note": (
            "本番(Streamlit Cloud)からは買取サイトが403で取得できないため、"
            "住宅IP環境で取得したこのスナップショットをフォールバックに使う。"
        ),
        "brands": sorted(fetched_brands | set(carried_over)),
        "errors": errors,
        "carried_over_brands": carried_over,
        "row_count": len(merged_rows),
        "rows": merged_rows,
    }, carried_over


def main():
    print("イオシス買取の価格表を取得しています…（13ブランド・十数秒かかります）")
    rows, errors = kaitori.fetch_all_brands()

    if not rows:
        print("NG: 1行も取得できませんでした。既存スナップショットは変更しません。")
        for e in errors:
            print("   ", e)
        print("   住宅IPのネットワークから実行しているか確認してください。")
        return 1

    previous = load_existing()
    snapshot, carried_over = build_snapshot(rows, errors, previous)

    os.makedirs(os.path.dirname(SNAPSHOT_PATH), exist_ok=True)
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"OK: {snapshot['row_count']} 行を書き出しました → {SNAPSHOT_PATH}")
    print(f"    取得日時: {snapshot['fetched_at']}")
    print(f"    ブランド: {len(snapshot['brands'])} 件")
    if errors:
        print("    取得に失敗したブランド:")
        for e in errors:
            print("      ", e)
    if carried_over:
        print(f"    既存スナップショットから温存したブランド: {', '.join(carried_over)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
