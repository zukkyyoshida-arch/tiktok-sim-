"""
market.py — モバイル版の中古相場（イオシス販売・買取）ルックアップ（streamlit非依存）。

スマホで「この機種、今いくら？」を1機種ずつ引くための薄いラッパー。
機種名マッチングやスナップショット読込は本家の `iosys.py` / `kaitori.py` をそのまま使う
（ロジックを二重に持たないため）。モジュールの探索順は次のとおり:

1. 通常の import（`mobile/` に iosys.py / kaitori.py / data_snapshots/ をコピーして
   単独リポジトリ化した場合はこちらで見つかる）
2. 1つ上の階層（本リポジトリのルート。Streamlit Cloud で `mobile/app.py` を
   メインファイルに指定してデプロイした場合はこちら）

どちらにも無ければ `available()` が False を返し、UI側で相場タブを案内表示に切り替える。
ライブ取得（スクレイピング）はスマホでは重いので行わず、同梱スナップショットのみを読む。
"""
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

_modules = None


def _load_modules():
    global _modules
    if _modules is not None:
        return _modules
    try:
        import iosys, kaitori  # noqa: E401
    except ImportError:
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        try:
            import iosys, kaitori  # noqa: E401
        except ImportError:
            _modules = (None, None)
            return _modules
    _modules = (iosys, kaitori)
    return _modules


def available():
    return _load_modules()[0] is not None


def list_models():
    """運用端末の機種リスト（正規化・重複除去済み）。モジュールが無ければ空リスト。"""
    iosys, _ = _load_modules()
    if iosys is None:
        return []
    seen, out = set(), []
    for name in iosys.BUILTIN_MODEL_LIST:
        norm = iosys.normalize_model_name(name)
        if norm and norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out


def load_snapshots():
    """同梱スナップショット（販売・買取）を読み込む。無ければ空で返す（例外は投げない）。"""
    iosys, kaitori = _load_modules()
    if iosys is None:
        return {"sale": {}, "sale_fetched_at": None, "kaitori_rows": [], "kaitori_fetched_at": None}
    sale = iosys.load_sale_snapshot() or {}
    rows, fetched_at = kaitori.load_snapshot()
    return {
        "sale": sale.get("results") or {},
        "sale_fetched_at": sale.get("fetched_at"),
        "kaitori_rows": rows,
        "kaitori_fetched_at": fetched_at,
    }


def rank_bucket(rank_str):
    """商品ランク表記を 未使用/Aランク/Bランク/Cランク/その他 に丸める（本家 _rank_bucket と同じ）。"""
    r = rank_str or ""
    if "未使用" in r:
        return "未使用"
    if "Aランク" in r or re.search(r"(?<![A-Za-z])A(?![A-Za-z])", r):
        return "Aランク"
    if "Bランク" in r or re.search(r"(?<![A-Za-z])B(?![A-Za-z])", r):
        return "Bランク"
    if "Cランク" in r or re.search(r"(?<![A-Za-z])C(?![A-Za-z])", r):
        return "Cランク"
    return "その他"


def lookup(model_name, snapshots):
    """1機種の販売相場・買取相場をまとめる。

    戻り値:
        {
          "sale": {"count", "min", "median", "max", "by_rank": {ランク: 最安}, "items": [...],
                   "search_url", "used_query"},
          "kaitori": {"unused_price", "used_max", "used_min", "matched_count", "page_url"} | None,
        }
    """
    _, kaitori = _load_modules()
    data = (snapshots.get("sale") or {}).get(model_name) or {}
    items = [it for it in (data.get("items") or []) if it.get("price") is not None]
    prices = sorted(it["price"] for it in items)
    by_rank = {}
    for it in items:
        b = rank_bucket(it.get("rank"))
        if b not in by_rank or it["price"] < by_rank[b]:
            by_rank[b] = it["price"]
    used_query = data.get("used_query") or model_name

    sale = {
        "count": len(items),
        "min": prices[0] if prices else None,
        "median": prices[len(prices) // 2] if prices else None,
        "max": prices[-1] if prices else None,
        "by_rank": by_rank,
        "items": items,
        "used_query": used_query,
        "search_url": f"https://iosys.co.jp/items?q={urllib.parse.quote(used_query)}",
    }

    kaitori_info = None
    rows = snapshots.get("kaitori_rows") or []
    if kaitori is not None and rows:
        matched = kaitori.match_models([model_name], rows)
        kaitori_info = matched.get(model_name)

    return {"sale": sale, "kaitori": kaitori_info}
