"""
analytics.py — Tik分析アプリ モバイル版のデータ取得・集計ロジック（streamlit非依存）。

本家 `app.py` の `fetch_data_logic` から「スマホでサッと見たい指標」だけを切り出して
移植したもの。UI（`mobile/app.py`）から分離してあるので、ネットワーク無しで
pytest による単体テストができる（`mobile/test_analytics.py`）。

データ源は本家と同じ GAS（script.google.com）の analytics シート。
列は本家と同じく「ヘッダ行の列名」で解決し、ヘッダ行が無い場合だけ固定インデックスに倒す。
"""
import random
import re
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

# 本家 app.py と同じエンドポイント（Lite / 本家）
GAS_URL_LITE = "https://script.google.com/macros/s/AKfycbxLevaqOFWn2dAMZHw5m-SQDUaZ1pvx2iXt9bcDGwPPglybPovvBIMV0fQGDrSd-Nbeag/exec"
GAS_URL_ORIGINAL = "https://script.google.com/macros/s/AKfycby9jacqr0U-jJ2QPdexit9g_RiBiUIyeQajZSVoiSW2HcLC445xiJMHyDfMjcCvL1Ob/exec"

# 本家のみ: 個人招待IDシート（管理番号/名前 → 機種名）
INVITE_ID_SHEET_ID = "1Rg8nMTOyU_MMe7wGS1ZbeqptTUFgRXoovy27bzq2zdY"
INVITE_ID_SHEET_NAME = "個人招待ID"

# GAS はコールドスタートが遅いので長めに取り、通信例外時は1回だけ再試行する（本家と同じ）
REQUEST_TIMEOUT = 30
RETRY_BACKOFF_MIN_SEC = 2.0
RETRY_BACKOFF_MAX_SEC = 3.0

JST = timezone(timedelta(hours=9))

# 期間プリセット（スマホでは細かい月指定より、ワンタップで切り替えられる方が使いやすい）
PERIOD_PRESETS = ("7日", "28日", "今月", "先月")

# ヘッダ行が検出できない場合のフォールバック固定列（本家 FALLBACK_ANALYTICS_COLUMNS と同値）
FALLBACK_COLUMNS = {
    "original": {"f": 3, "child": 4, "auth": 6, "j": 7, "date1": 8, "date2": 9, "n": 10, "q": 11,
                 "parent_type": None},
    "lite": {"f": 3, "child": 4, "j": 5, "auth": None, "date1": 7, "date2": 13, "n": 9, "q": 10,
             "parent_type": None},
}

FRAME_COLUMNS = [
    "date", "day", "is_success", "status", "model", "brand", "auth_method",
    "parent_id", "parent_model", "parent_brand", "parent_type", "child_id", "invite_type",
]

INTERVAL_ORDER = ["同日(0日)", "1日", "2日", "3日", "4〜5日", "6日以上", "初回/データなし"]


# ------------------------------------------------------------
# 時刻
# ------------------------------------------------------------
def now_jst():
    """JSTの現在時刻（naive datetime）。Streamlit Cloud はUTCで動くため、日付判定は必ずこれを使う。"""
    return datetime.now(JST).replace(tzinfo=None)


# ------------------------------------------------------------
# 取得
# ------------------------------------------------------------
def gas_url(target_app):
    return GAS_URL_ORIGINAL if target_app == "original" else GAS_URL_LITE


def fetch_payload(target_app, force_key=None, session=None):
    """GAS から analytics ペイロード（dict）を取得する。失敗時は None。

    通信例外時は1回だけ再試行する（本家 fetch_api_data_raw と同じ流儀）。
    """
    url = f"{gas_url(target_app)}?action=get_analytics&app={target_app}"
    if force_key:
        url += f"&t={force_key}"
    http = session or requests

    for attempt in (1, 2):
        try:
            resp = http.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code != 200:
                return None
            return resp.json()
        except requests.RequestException as e:
            print(f"[fetch_payload] {target_app}: {e} (attempt {attempt})", file=sys.stderr)
            if attempt == 1:
                time.sleep(random.uniform(RETRY_BACKOFF_MIN_SEC, RETRY_BACKOFF_MAX_SEC))
        except Exception as e:  # JSON壊れ等
            print(f"[fetch_payload] {target_app}: {e}", file=sys.stderr)
            return None
    return None


def fetch_invite_id_map():
    """個人招待IDシート(CSV)から 管理番号/名前 → 機種名 の辞書を作る（本家のみ）。失敗時は空dict。"""
    mapping = {}
    try:
        sheet = urllib.parse.quote(INVITE_ID_SHEET_NAME)
        csv_url = (f"https://docs.google.com/spreadsheets/d/{INVITE_ID_SHEET_ID}"
                   f"/gviz/tq?tqx=out:csv&sheet={sheet}")
        csv_df = pd.read_csv(csv_url)
        for _, r in csv_df.iterrows():
            # 0列目: 管理番号, 1列目: 名前, 6列目: 機種名
            if len(r) >= 7 and pd.notnull(r.iloc[6]) and str(r.iloc[6]).strip():
                model = str(r.iloc[6]).strip()
                for idx in (0, 1):
                    if pd.notnull(r.iloc[idx]):
                        key = _strip_float_suffix(str(r.iloc[idx]).strip())
                        mapping[key] = model
    except Exception as e:
        print(f"[fetch_invite_id_map] {e}", file=sys.stderr)
    return mapping


def terminal_map(payload):
    """ペイロードの terminals 行列から 管理番号(row[3]) → 機種名(row[5]) の辞書を作る。"""
    rows = (payload or {}).get("terminals") or []
    return {str(row[3]): str(row[5]) for row in rows if isinstance(row, (list, tuple)) and len(row) > 5}


# ------------------------------------------------------------
# パース
# ------------------------------------------------------------
def _strip_float_suffix(s):
    return s[:-2] if s.endswith(".0") else s


def resolve_columns(header_row, target_app):
    """ヘッダ行から列位置を列名で解決する。ヘッダ行でなければ None（本家 _resolve_analytics_columns 相当）。"""
    if not header_row:
        return None
    cells = [str(c).strip() for c in header_row]

    def find(name, start=0):
        for i in range(start, len(cells)):
            if cells[i] == name:
                return i
        return None

    if find("状態") is None or find("機種") is None:
        return None

    cols = {
        "f": find("状態"),
        "child": find("端末番号"),
        "j": find("機種"),
        "n": find("親"),
        "q": find("招待種類"),
        "auth": find("子認証方法") if target_app == "original" else find("招待方法"),
        "date1": find("Tik開始"),
        "parent_type": find("親の種類"),
    }
    # 「時刻」は同名2列があり得るため、「Tik開始」より後ろの最初の「時刻」を日付フォールバック列にする
    cols["date2"] = find("時刻", start=cols["date1"] + 1) if cols["date1"] is not None else None

    if any(cols[k] is None for k in ("f", "child", "j", "n", "date1")):
        return None
    return cols


def parse_date(val, now=None):
    """シートの日付セルを naive datetime に。読めなければ NaT（本家 parse_date と同じ規則）。"""
    now = now or now_jst()
    if val is None or val == "" or val == "#REF!":
        return pd.NaT
    if isinstance(val, float) and np.isnan(val):
        return pd.NaT
    if isinstance(val, str) and "T" in val:
        try:
            dt = pd.to_datetime(val)
            if dt.tzinfo is not None:
                return dt.tz_convert("Asia/Tokyo").tz_localize(None)
            return dt
        except Exception:
            pass
    if isinstance(val, str):
        clean = re.sub(r"\(.*?\)", "", val).strip()
        try:
            if "月" in clean and "/" not in clean:
                return pd.NaT
            dt = datetime.strptime(f"{now.year}/{clean}", "%Y/%m/%d")
            if dt > now + timedelta(days=1):
                dt = dt.replace(year=dt.year - 1)
            return pd.Timestamp(dt)
        except Exception:
            pass
    try:
        dt = pd.to_datetime(val)
        if getattr(dt, "tzinfo", None) is not None:
            return dt.tz_convert("Asia/Tokyo").tz_localize(None)
        return dt
    except Exception:
        return pd.NaT


def get_brand(model_name):
    m = str(model_name).upper()
    if "XPERIA" in m: return "Xperia"
    if "AQUOS" in m or "SH-" in m: return "AQUOS"
    if "PIXEL" in m: return "Pixel"
    if "GALAXY" in m or "SC-" in m or "SM-" in m: return "Galaxy"
    if "IPHONE" in m: return "iPhone"
    if "OPPO" in m or "CPH" in m: return "OPPO"
    if "XIAOMI" in m or "REDMI" in m: return "Xiaomi"
    if "BASIO" in m or "KYV" in m: return "BASIO"
    if "HUAWEI" in m or "HW-" in m or "POT-" in m or "MAR-" in m: return "HUAWEI"
    return "その他"


def _clean_parent_id(raw):
    pid = str(raw).strip()
    if not pid or pid in ("nan", "None"):
        return "未指定"
    if re.search(r"[一-鿿]", pid):
        return "個人垢"
    return pid


def _empty_frame():
    return pd.DataFrame({c: pd.Series(dtype="object") for c in FRAME_COLUMNS})


def build_frame(payload, target_app, terminals=None, now=None):
    """GASペイロードを、集計しやすい名前付き列の DataFrame に整形する。

    戻り値の列: FRAME_COLUMNS。日付を持たない行（スケジュール行など）は落とす。
    データが無い場合は空の DataFrame を返す（例外は投げない）。
    """
    now = now or now_jst()
    terminals = terminals or {}
    raw = (payload or {}).get("analytics")
    if not raw:
        return _empty_frame()

    cols = resolve_columns(raw[0], target_app)
    if cols is not None:
        rows = raw[1:]
        if not rows:
            return _empty_frame()
        df = pd.DataFrame(rows).reindex(columns=range(len(raw[0])))
    else:
        cols = dict(FALLBACK_COLUMNS[target_app])
        df = pd.DataFrame(raw)

    # 参照する列が行幅より広い場合に KeyError にならないよう列を埋める
    widest = max(i for i in cols.values() if i is not None)
    if df.shape[1] <= widest:
        df = df.reindex(columns=range(widest + 1))
    if df.empty:
        return _empty_frame()

    def _col(key, default=""):
        idx = cols.get(key)
        if idx is None:
            return pd.Series([default] * len(df), index=df.index, dtype="object")
        return df[idx]

    out = pd.DataFrame(index=df.index)

    d1 = _col("date1").map(lambda v: parse_date(v, now))
    d1 = pd.to_datetime(d1, errors="coerce")
    ok1 = d1.notna() & (d1.dt.year > 1900)
    if cols.get("date2") is not None:
        d2 = pd.to_datetime(_col("date2").map(lambda v: parse_date(v, now)), errors="coerce")
        ok2 = d2.notna() & (d2.dt.year > 1900)
        out["date"] = d1.where(ok1, d2.where(ok2, pd.NaT))
    else:
        out["date"] = d1.where(ok1, pd.NaT)

    status = _col("f").fillna("").astype(str)
    out["status"] = status
    out["is_success"] = status.str.contains("成功")

    model = _col("j").fillna("不明").astype(str).str.strip()
    out["model"] = model.where(model != "", "不明")
    out["brand"] = out["model"].map(get_brand)

    if cols.get("auth") is not None:
        auth = _col("auth").fillna("不明").astype(str).str.strip()
        if target_app != "original":
            # liteの「招待方法」は「Google認証」「LINE認証」表記のため本家表記（Google/LINE）に揃える
            auth = auth.str.replace(r"認証$", "", regex=True)
        out["auth_method"] = auth.where(auth != "", "未設定")
    else:
        out["auth_method"] = "未設定"

    parent_raw = _col("n").fillna("未指定").astype(str).map(_strip_float_suffix)
    out["parent_id"] = parent_raw.map(_clean_parent_id)
    out["parent_model"] = parent_raw.map(terminals).fillna("不明")
    out["parent_brand"] = out["parent_model"].map(get_brand)

    ptype = _col("parent_type").fillna("").astype(str).str.strip()
    out["parent_type"] = ptype.where(ptype != "", "未設定")

    out["child_id"] = _col("child").fillna("未指定").astype(str)

    invite = _col("q").fillna("").astype(str).str.strip()
    out["invite_type"] = invite.where(invite != "", "未設定")
    # 招待種類が4桁数字だけの行は入力ノイズとして除外（本家と同じ）
    noise = invite.str.match(r"^\d{4}$")

    out = out[~noise & out["date"].notna()].copy()
    out["date"] = pd.to_datetime(out["date"])
    out["day"] = out["date"].dt.normalize()
    return out[FRAME_COLUMNS].reset_index(drop=True)


# ------------------------------------------------------------
# 期間
# ------------------------------------------------------------
def period_bounds(preset, now=None):
    """プリセット名 → (開始datetime, 終了datetime)。終了は常に「今」（未来行を除外するため）。"""
    now = now or now_jst()
    if preset == "7日":
        return now - timedelta(days=7), now
    if preset == "今月":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0), now
    if preset == "先月":
        first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = first_this - timedelta(seconds=1)
        return last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0), last_month_end
    # 既定: 28日
    return now - timedelta(days=28), now


def filter_period(df, preset, now=None):
    if df is None or df.empty:
        return _empty_frame()
    start, end = period_bounds(preset, now)
    return df[(df["date"] >= start) & (df["date"] <= end)].copy()


# ------------------------------------------------------------
# 集計
# ------------------------------------------------------------
def _rate_table(df, col, label, drop_numeric_noise=False):
    """カテゴリ列1本の 試行数/成功数/成功率 表。"""
    empty = pd.DataFrame(columns=[label, "試行数", "成功数", "成功率"])
    if df is None or df.empty or col not in df.columns:
        return empty
    vals = df[col].astype(str).str.strip()
    sub = df.assign(**{col: vals})
    if drop_numeric_noise:
        sub = sub[~vals.str.match(r"^\d+$")]
    if sub.empty:
        return empty
    g = sub.groupby(col).agg(試行数=("is_success", "count"), 成功数=("is_success", "sum")).reset_index()
    g["成功数"] = g["成功数"].astype(int)
    g["成功率"] = (g["成功数"] / g["試行数"] * 100).round(1)
    return g.rename(columns={col: label})


def _sort(df, by, ascending):
    if df.empty:
        return df
    return df.sort_values(by, ascending=ascending).reset_index(drop=True)


def daily_table(df):
    """日別の 試行数/成功数/成功率（日付昇順）。"""
    if df is None or df.empty:
        return pd.DataFrame(columns=["日付", "試行数", "成功数", "成功率"])
    g = df.groupby("day").agg(試行数=("is_success", "count"), 成功数=("is_success", "sum")).reset_index()
    g["成功数"] = g["成功数"].astype(int)
    g["成功率"] = (g["成功数"] / g["試行数"] * 100).round(1)
    return g.rename(columns={"day": "日付"}).sort_values("日付").reset_index(drop=True)


def day_stats(df, day):
    """特定日の {試行数, 成功数, 成功率}。その日の行が無ければ None。"""
    if df is None or df.empty:
        return None
    target = pd.Timestamp(day).normalize()
    sub = df[df["day"] == target]
    if sub.empty:
        return None
    n = int(len(sub))
    s = int(sub["is_success"].sum())
    return {"試行数": n, "成功数": s, "成功率": round(s / n * 100, 1) if n else 0.0}


def recent_days(df, now=None):
    """今日・昨日の実績（期間フィルタとは無関係に、全データから求める）。"""
    now = now or now_jst()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "today": day_stats(df, today),
        "yesterday": day_stats(df, today - timedelta(days=1)),
        "today_label": today.strftime("%m/%d"),
        "yesterday_label": (today - timedelta(days=1)).strftime("%m/%d"),
    }


def interval_table(df):
    """親機ごとの「前回招待からの経過日数（中日）」別 成功率（本家 interval_trend 相当）。"""
    cols = ["中日", "試行数", "成功数", "成功率"]
    if df is None or df.empty:
        return pd.DataFrame(columns=cols)
    s = df.sort_values(["parent_id", "date"]).copy()
    s["prev"] = s.groupby("parent_id")["date"].shift(1)
    s["gap"] = (s["date"] - s["prev"]).dt.days

    def cat(days):
        if pd.isna(days): return "初回/データなし"
        if days <= 0: return "同日(0日)"
        if days == 1: return "1日"
        if days == 2: return "2日"
        if days == 3: return "3日"
        if days <= 5: return "4〜5日"
        return "6日以上"

    s["中日"] = s["gap"].map(cat)
    g = _rate_table(s, "中日", "中日")
    g["order"] = g["中日"].map(lambda x: INTERVAL_ORDER.index(x) if x in INTERVAL_ORDER else 99)
    return g.sort_values("order").drop(columns="order").reset_index(drop=True)


def parent_table(df):
    """親機（個体）別の成績。成功数→成功率の降順。"""
    cols = ["親機ID", "親機種", "試行数", "成功数", "成功率", "最終成功日"]
    if df is None or df.empty:
        return pd.DataFrame(columns=cols)
    s = df.copy()
    s["success_date"] = s["date"].where(s["is_success"])
    g = s.groupby(["parent_id", "parent_model"]).agg(
        試行数=("is_success", "count"), 成功数=("is_success", "sum"), 最終成功日=("success_date", "max")
    ).reset_index()
    g["成功数"] = g["成功数"].astype(int)
    g["成功率"] = (g["成功数"] / g["試行数"] * 100).round(1)
    g["最終成功日"] = pd.to_datetime(g["最終成功日"]).dt.strftime("%m/%d").fillna("-")
    g = g.rename(columns={"parent_id": "親機ID", "parent_model": "親機種"})
    return _sort(g[cols], ["成功数", "成功率"], [False, False])


def summarize(rdf):
    """期間内データの集計一式（UIはこの dict だけを見ればよい）。"""
    if rdf is None or rdf.empty:
        return None
    total = int(len(rdf))
    success = int(rdf["is_success"].sum())
    return {
        "total": total,
        "success": success,
        "rate": round(success / total * 100, 1) if total else 0.0,
        "period": f"{rdf['date'].min():%Y/%m/%d} - {rdf['date'].max():%m/%d}",
        "days": int(rdf["day"].nunique()),
        "daily": daily_table(rdf),
        "campaign": _sort(_rate_table(rdf, "invite_type", "招待種類", drop_numeric_noise=True),
                          ["成功率", "試行数"], [False, False]),
        "auth": _sort(_rate_table(rdf, "auth_method", "認証方法", drop_numeric_noise=True),
                      ["成功率", "試行数"], [False, False]),
        "brand": _sort(_rate_table(rdf, "brand", "ブランド"), ["成功率", "試行数"], [False, False]),
        "model": _sort(_rate_table(rdf, "model", "機種"), ["試行数", "成功率"], [False, False]),
        "parent_brand": _sort(_rate_table(rdf, "parent_brand", "親ブランド"), ["成功率", "試行数"], [False, False]),
        "parent_type": _sort(_rate_table(rdf, "parent_type", "親の種類", drop_numeric_noise=True),
                             ["成功率", "試行数"], [False, False]),
        "parent": parent_table(rdf),
        "interval": interval_table(rdf),
    }
