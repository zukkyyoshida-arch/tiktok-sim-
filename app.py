import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import urllib.parse
import io
from datetime import datetime, timedelta
import re
import json
import requests
import concurrent.futures
import sys
import time
import random
from streamlit_autorefresh import st_autorefresh
from plotly.subplots import make_subplots
import iosys
import kaitori

# ==========================================
# 1. 定数・設定
# ==========================================
CURRENT_VERSION = "11.2.0"
GAS_URL_LITE = "https://script.google.com/macros/s/AKfycbxLevaqOFWn2dAMZHw5m-SQDUaZ1pvx2iXt9bcDGwPPglybPovvBIMV0fQGDrSd-Nbeag/exec"
GAS_URL_ORIGINAL = "https://script.google.com/macros/s/AKfycby9jacqr0U-jJ2QPdexit9g_RiBiUIyeQajZSVoiSW2HcLC445xiJMHyDfMjcCvL1Ob/exec"

def get_gas_url(target_app):
    url = GAS_URL_ORIGINAL if target_app == "original" else GAS_URL_LITE
    return url

# ページ設定
st.set_page_config(
    page_title="Tik分析アプリ",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="auto"
)

# 10分ごとに自動更新 (600,000ミリ秒)
st_autorefresh(interval=600000, key="datarefresh")

# ==========================================
# 2. スタイル・UI部品
# ==========================================
def apply_custom_styles():
    st.markdown("""
        <style>
        .main { background-color: #000000; color: #e0e0e0; }
        .metric-container { background-color: #0a0a0a; padding: 24px; border-radius: 12px; border: 1px solid #1a1a1a; margin-bottom: 20px; }
        .metric-label { color: #888888; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; }
        .metric-value { color: #ffffff; font-size: 2.5rem; font-weight: 700; }
        .metric-sub { color: #00ff88; font-size: 0.8rem; }
        .advice-card { background-color: #050a15; padding: 24px; border-radius: 12px; border: 1px solid #0044ff; margin-bottom: 30px; }
        .advice-title { color: #0088ff; font-weight: 700; font-size: 1.2rem; }
        .advice-text { color: #e0e0e0; line-height: 1.6; }
        </style>
        """, unsafe_allow_html=True)

def custom_metric(label, value, sub=""):
    st.markdown(f"""
        <div class='metric-container'>
            <div class='metric-label'>{label}</div>
            <div class='metric-value'>{value}</div>
            <div class='metric-sub'>{sub}</div>
        </div>
        """, unsafe_allow_html=True)

# ==========================================
# 3. バックエンド通信ロジック
# ==========================================
@st.cache_data(ttl=600)
def fetch_api_data_raw(target_app, force_key=None):
    """GAS（script.google.com）からanalyticsデータを取得する。

    GASはコールドスタート時に応答が遅く、timeout=15秒だと
    'Read timed out' で落ちることがある（実測済み）。30秒に延長したうえで、
    通信例外時は1回だけ再試行する（iosys.py の _get_with_retry と同じ発想）。
    """
    base_url = get_gas_url(target_app)
    if not base_url:
        return None
    url = f"{base_url}?action=get_analytics&app={target_app}"
    if force_key:
        url += f"&t={force_key}"

    try:
        response = requests.get(url, timeout=30)
        if response.status_code != 200:
            return None
        return response.json()
    except requests.RequestException as e:
        print(f"[fetch_api_data_raw] {target_app}: {e} (retry)", file=sys.stderr)
        time.sleep(random.uniform(2.0, 3.0))
        try:
            response = requests.get(url, timeout=30)
            if response.status_code != 200:
                return None
            return response.json()
        except Exception as e2:
            print(f"[fetch_api_data_raw] {target_app}: {e2}", file=sys.stderr)
            return None
    except Exception as e:
        print(f"[fetch_api_data_raw] {target_app}: {e}", file=sys.stderr)
        return None

@st.cache_data(ttl=600)
def _fetch_invite_id_map():
    """個人招待IDシート(CSV)から 管理番号/名前 -> 機種名 のマッピングを取得する。
    本体データより更新頻度が低いため10分キャッシュする。"""
    d_map_extra = {}
    try:
        sheet_id = "1Rg8nMTOyU_MMe7wGS1ZbeqptTUFgRXoovy27bzq2zdY"
        sheet_name = urllib.parse.quote("個人招待ID")
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={sheet_name}"
        csv_df = pd.read_csv(csv_url)
        for _, r in csv_df.iterrows():
            # Column 0: 管理番号, Column 1: 名前, Column 6: 機種名
            if len(r) >= 7 and pd.notnull(r.iloc[6]) and str(r.iloc[6]).strip() != "":
                model = str(r.iloc[6]).strip()
                if pd.notnull(r.iloc[0]):
                    k0 = str(r.iloc[0]).strip()
                    if k0.endswith('.0'): k0 = k0[:-2]
                    d_map_extra[k0] = model
                if pd.notnull(r.iloc[1]):
                    k1 = str(r.iloc[1]).strip()
                    if k1.endswith('.0'): k1 = k1[:-2]
                    d_map_extra[k1] = model
    except Exception as e:
        print("Error fetching 個人招待ID:", e)
    return d_map_extra

# analytics行列のフォールバック用固定列インデックス。
# ヘッダ行が検出できない場合にのみ使う従来の決め打ち値（挙動は旧実装と完全一致させる）。
FALLBACK_ANALYTICS_COLUMNS = {
    "original": {"f": 3, "child": 4, "auth": 6, "j": 7, "date1": 8, "date2": 9, "n": 10, "q": 11,
                 "parent_type": None, "child_type": None, "work_hours": None, "verify2": None,
                 "weekday_raw": None, "hour_label": None},
    "lite": {"f": 3, "child": 4, "j": 5, "auth": None, "date1": 7, "date2": 13, "n": 9, "q": 10,
             "parent_type": None, "child_type": None, "work_hours": None, "verify2": None,
             "weekday_raw": None, "hour_label": None},
}


def _resolve_analytics_columns(header_row, target_app):
    """analyticsの先頭行（ヘッダ行）から列位置を「名前」で解決する。

    シート側の列の追加・入れ替えがあっても、列名が同じなら正しい列を掴めるようにする。
    先頭行に「状態」と「機種」が両方無ければヘッダ行とみなさず None を返す。
    必須列（状態/端末番号/機種/親/Tik開始）が欠けている場合も None を返す
    （呼び出し側で FALLBACK_ANALYTICS_COLUMNS に倒す）。
    """
    if not header_row:
        return None
    cells = [str(c).strip() for c in header_row]

    def find(name, start=0):
        for i in range(start, len(cells)):
            if cells[i] == name:
                return i
        return None

    # ヘッダ行の検出: 「状態」と「機種」が両方あることを条件とする
    if find("状態") is None or find("機種") is None:
        return None

    cols = {
        "f": find("状態"),
        "child": find("端末番号"),
        "j": find("機種"),
        "n": find("親"),
        "q": find("招待種類"),
        # 認証方法: originalは「子認証方法」、liteは「招待方法」
        "auth": find("子認証方法") if target_app == "original" else find("招待方法"),
        "date1": find("Tik開始"),
        "parent_type": find("親の種類"),   # liteにのみ存在
        "child_type": find("子種別"),      # originalにのみ存在
        "work_hours": find("稼働時間"),
        "verify2": find("検証2"),          # liteにのみ存在（数珠つなぎ運用の判定列）
        "weekday_raw": find("曜日"),       # 実測値: 月/火/水/木/金/土/日 の日本語文字列
        # 実測値: 「Tik開始」列（date1）はISO日時だが時刻部分が常に00:00:00固定で
        # 時刻情報を持たない。実際の時刻(hour)は先頭寄りの「時刻」列（"14時"のような
        # 文字列）にあるため、「Tik開始」より前の最初の「時刻」を hour_label として掴む
        "hour_label": find("時刻"),
    }
    # 「時刻」は同名2列があり得るため、「Tik開始」より後ろの最初の「時刻」を
    # 日付フォールバック列（date2）とする
    cols["date2"] = find("時刻", start=cols["date1"] + 1) if cols["date1"] is not None else None

    # 必須列が1つでも欠けていたらフォールバックへ倒す
    if any(cols[k] is None for k in ("f", "child", "j", "n", "date1")):
        return None
    return cols


def _axis_summary(raw_df, col):
    r"""カテゴリ軸1本の 試行数/成功率 サマリを返す共通ヘルパー。

    値はstr化し、数字のみの値（^\d+$）はシートの入力ノイズとして除外する。
    成功率は既存集計と同じ流儀（np.ceilで小数3位切り上げ）。
    work_hours_band だけは帯の数値開始で昇順ソートし、それ以外は成功率降順。
    """
    vals = raw_df[col].astype(str).str.strip()
    mask = ~vals.str.match(r'^\d+$')
    tmp = raw_df[mask].copy()
    if tmp.empty:
        return pd.DataFrame(columns=[col, '試行数', '成功率'])
    tmp[col] = vals[mask]
    axis_df = tmp.groupby(col).agg(試行数=('is_success', 'count'),
                                   成功率=('is_success', 'mean')).reset_index()
    axis_df['成功率'] = np.ceil(axis_df['成功率'] * 100 * 1000) / 1000
    if col == 'work_hours_band':
        def _band_start(v):
            m = re.match(r'^(\d+)', str(v))
            return int(m.group(1)) if m else float('inf')
        axis_df = axis_df.sort_values(col, key=lambda s: s.map(_band_start))
    else:
        axis_df = axis_df.sort_values('成功率', ascending=False)
    return axis_df.reset_index(drop=True)


def _wilson_ci(successes, n, z=1.96):
    r"""Wilson score interval（95%信頼区間、既定z=1.96）を返す。scipy非依存の自前実装。

    n=0のときは (0.0, 0.0) を返す（呼び出し側で「データなし」表示に倒す想定）。
    戻り値は成功率と同じ0〜1スケール（呼び出し側で×100する）。
    """
    if n <= 0:
        return 0.0, 0.0
    p = successes / n
    denom = 1 + (z ** 2) / n
    center = p + (z ** 2) / (2 * n)
    margin = z * np.sqrt((p * (1 - p) / n) + (z ** 2) / (4 * n ** 2))
    lo = (center - margin) / denom
    hi = (center + margin) / denom
    return max(0.0, lo), min(1.0, hi)


def _rate_summary_with_ci(df, group_col, success_col='is_success', failure_col='is_failure'):
    r"""成功+失敗のみを分母とした 試行数/成功数/成功率/Wilson95%CI のカテゴリ集計を返す。

    数珠分析タブ専用。df は事前に対象範囲（例: 検証2=='数珠'）へ絞り込み済みのものを渡す。
    進行不可・空（success_col/failure_colどちらもFalse）の行は分母から除外する。
    """
    cols = [group_col, '試行数', '成功数', '成功率', 'CI下限', 'CI上限']
    if df.empty or group_col not in df.columns:
        return pd.DataFrame(columns=cols)
    sub = df[df[success_col] | df[failure_col]].copy()
    if sub.empty:
        return pd.DataFrame(columns=cols)
    vals = sub[group_col].astype(str).str.strip()
    sub[group_col] = vals
    g = sub.groupby(group_col).agg(試行数=(success_col, 'count'), 成功数=(success_col, 'sum')).reset_index()
    g['成功率'] = (g['成功数'] / g['試行数'] * 100).round(1)
    ci = g.apply(lambda r: _wilson_ci(r['成功数'], r['試行数']), axis=1)
    g['CI下限'] = ci.map(lambda t: round(t[0] * 100, 1))
    g['CI上限'] = ci.map(lambda t: round(t[1] * 100, 1))
    return g[cols]


def _overall_rate_with_ci(df, success_col='is_success', failure_col='is_failure'):
    r"""df全体（成功+失敗のみ）の 試行数/成功数/成功率/Wilson95%CI をタプルで返す。"""
    sub = df[df[success_col] | df[failure_col]]
    n = len(sub)
    s = int(sub[success_col].sum())
    rate = (s / n * 100) if n > 0 else 0.0
    lo, hi = _wilson_ci(s, n)
    return n, s, round(rate, 1), round(lo * 100, 1), round(hi * 100, 1)


def _parent_type_map(raw_df):
    r"""parent_idごとの「親の種類」（parent_typeの最頻値）の辞書を返す。

    数字のみのノイズ値（^\d+$）を除外してから最頻値を取る。
    対応が無いparent_idは呼び出し側で「未設定」に倒す。
    """
    if 'parent_type' not in raw_df.columns:
        return {}
    vals = raw_df['parent_type'].astype(str).str.strip()
    sub = raw_df[~vals.str.match(r'^\d+$')]
    if sub.empty:
        return {}
    return sub.groupby('parent_id')['parent_type'].agg(lambda s: s.mode().iloc[0]).to_dict()


def fetch_data_logic(target_app, f_mode, l_days=None, t_month=None, force=False):
    try:
        f_key = str(datetime.now().timestamp()) if force else None
        payload = fetch_api_data_raw(target_app, force_key=f_key)
        if payload is None:
            return "APIに接続できませんでした（初回はサーバー起動に時間がかかります）。もう一度同期してください"
        if "analytics" not in payload: return "Invalid API Response"

        raw_data = payload['analytics']
        if not raw_data: return "No Data"

        cols = _resolve_analytics_columns(raw_data[0], target_app)
        if cols is not None:
            # ヘッダ行を明示的に除いたデータ行だけをDataFrame化し、列数はヘッダ幅に揃える
            data_rows = raw_data[1:]
            if not data_rows: return "No Data"
            df = pd.DataFrame(data_rows)
            df = df.reindex(columns=range(len(raw_data[0])))
        else:
            # ヘッダが検出できない場合: 従来の固定インデックス・全行処理（挙動維持）
            print(f"[fetch_data_logic] {target_app}: analyticsのヘッダ行を検出できないため、"
                  f"従来の固定列インデックスにフォールバックします", file=sys.stderr)
            cols = dict(FALLBACK_ANALYTICS_COLUMNS[target_app])
            df = pd.DataFrame(raw_data)

        f_idx = cols["f"]
        child_idx = cols["child"]
        j_idx = cols["j"]
        auth_idx = cols["auth"]
        date1_idx = cols["date1"]
        date2_idx = cols["date2"]
        n_idx = cols["n"]
        q_idx = cols["q"]

        def parse_date(val):
            if not val or val == "" or val == "#REF!": return pd.NaT
            if isinstance(val, str) and "T" in val:
                try:
                    dt = pd.to_datetime(val)
                    if dt.tzinfo is not None:
                        return dt.tz_convert('Asia/Tokyo').tz_localize(None)
                    return dt
                except: pass
            if isinstance(val, str):
                clean = re.sub(r'\(.*?\)', '', val).strip()
                try:
                    if "月" in clean and "/" not in clean: return pd.NaT
                    dt = datetime.strptime(f"{datetime.now().year}/{clean}", "%Y/%m/%d")
                    if dt > datetime.now() + timedelta(days=1): dt = dt.replace(year=dt.year-1)
                    return dt
                except: pass
            try:
                dt = pd.to_datetime(val)
                if getattr(dt, 'tzinfo', None) is not None:
                    return dt.tz_convert('Asia/Tokyo').tz_localize(None)
                return dt
            except: return pd.NaT

        def get_valid_date(row):
            if len(row) > date1_idx:
                d1 = parse_date(row[date1_idx])
                if pd.notnull(d1) and d1.year > 1900: return d1
            if date2_idx is not None and len(row) > date2_idx:
                d2 = parse_date(row[date2_idx])
                if pd.notnull(d2) and d2.year > 1900: return d2
            return pd.NaT

        df['date'] = df.apply(get_valid_date, axis=1)
        df['is_success'] = df[f_idx].astype(str).str.contains("成功")
        if j_idx in df.columns:
            # 実データに「AQUOS sense7 」のような末尾空白があり、ランキングが分裂するためstripする
            df['model'] = df[j_idx].fillna("不明").astype(str).str.strip()
        else:
            df['model'] = "不明"

        if auth_idx is not None and auth_idx in df.columns:
            if target_app == "original":
                df['auth_method'] = df[auth_idx].fillna("不明").astype(str)
            else:
                # liteの「招待方法」は「Google認証」「LINE認証」表記のため、末尾の「認証」を
                # 除去してoriginalの表記（Google/LINE）に揃える。空欄は「未設定」に寄せる
                auth_series = df[auth_idx].fillna("不明").astype(str).str.strip()
                auth_series = auth_series.str.replace(r'認証$', '', regex=True)
                df['auth_method'] = auth_series.where(auth_series != "", "未設定")
        else:
            df['auth_method'] = "未設定"
        
        d_raw = payload.get('terminals', [])
        if (not d_raw or len(d_raw) == 0) and target_app == "original":
            lite_payload = fetch_api_data_raw("lite", force_key=f_key)
            if lite_payload:
                d_raw = lite_payload.get('terminals', [])
        
        d_map = {str(row[3]): str(row[5]) for row in d_raw if len(row) > 5}

        if target_app == "original":
            # fetch 個人招待ID mapping from the new spreadsheet via csv (cached)
            d_map.update(_fetch_invite_id_map())
        
        rdf = df.copy()
        if f_mode == "直近28日間": 
            rdf = rdf[rdf['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            rdf = rdf[(rdf['date'].dt.year == target_dt.year) & (rdf['date'].dt.month == target_dt.month)].copy()
        
        # 🌟 追加: 未来の日付（スケジュール行など）を分析対象から除外（JST基準）
        jst_now = datetime.utcnow() + timedelta(hours=9)
        rdf = rdf[rdf['date'] <= jst_now].copy()
        
        if len(rdf) == 0: return "No Data for this period"
        rdf['original_parent_id'] = rdf[n_idx].fillna("未指定").astype(str).apply(lambda x: x[:-2] if x.endswith('.0') else x)
        def process_parent_id(pid):
            pid = str(pid).strip()
            if not pid or pid == "nan" or pid == "None": return "未指定"
            if re.search(r'[\u4E00-\u9FFF]', pid):
                return "個人垢"
            return pid
            
        rdf['parent_id'] = rdf['original_parent_id'].apply(process_parent_id)
        rdf['parent_model'] = rdf['original_parent_id'].map(d_map).fillna("不明")

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
        
        rdf['brand'] = rdf['model'].apply(get_brand)
        rdf['parent_brand'] = rdf['parent_model'].apply(get_brand)
        rdf['child_id'] = rdf[child_idx].fillna("未指定").astype(str) # 端末番号を子IDとして定義

        # 招待種類: 行フィルタ（^\d{4}$ の除外）は従来どおり。加えて名前付き列 invite_type を持たせる
        if q_idx is not None:
            rdf = rdf[~rdf[q_idx].astype(str).str.match(r'^\d{4}$')].copy()
            invite_vals = rdf[q_idx].fillna("").astype(str).str.strip()
            rdf['invite_type'] = invite_vals.where(invite_vals != "", "未設定")
        else:
            rdf['invite_type'] = "未設定"

        # 追加の名前付き列（その列を持つシートにだけ作る）
        for src_key, col_name in (("parent_type", "parent_type"),
                                  ("child_type", "child_type"),
                                  ("work_hours", "work_hours_band"),
                                  ("verify2", "verify2")):
            src_idx = cols[src_key]
            if src_idx is not None:
                vals = rdf[src_idx].fillna("").astype(str).str.strip()
                rdf[col_name] = vals.where(vals != "", "未設定")

        # 集計（キャンペーン別）: 名前付き列 invite_type を軸にし、表示列名は「招待種類」に統一
        sum_df = rdf.groupby('invite_type').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        sum_df = sum_df.rename(columns={'invite_type': '招待種類'})
        sum_df['成功率'] = np.ceil(sum_df['成功率']*100*1000)/1000
        
        rdf['success_date'] = rdf['date'].where(rdf['is_success'])
        
        # トップ30用の集計 (漢字の名前をそのまま表示)
        top30_df = rdf.groupby(['original_parent_id', 'parent_model']).agg(
            試行数=('is_success','count'), 
            成功数=('is_success','sum'), 
            成功率=('is_success','mean'),
            最終成功日=('success_date','max')
        ).reset_index()
        top30_df['最終成功日'] = top30_df['最終成功日'].dt.strftime('%m/%d').fillna('-')
        top30_df['成功率'] = np.ceil(top30_df['成功率']*100*1000)/1000
        top30_df = top30_df.sort_values(['成功数', '成功率'], ascending=[False, False])
        
        # 全体分析用の集計 (漢字は個人垢としてまとめる)
        parent_df = rdf.groupby(['parent_id']).agg(
            試行数=('is_success','count'), 
            成功数=('is_success','sum'), 
            成功率=('is_success','mean'),
            最終成功日=('success_date','max')
        ).reset_index()
        parent_df['最終成功日'] = parent_df['最終成功日'].dt.strftime('%m/%d').fillna('-')
        parent_df['成功率'] = np.ceil(parent_df['成功率']*100*1000)/1000
        parent_df = parent_df.sort_values(['成功率', '成功数'], ascending=[False, False])

        p_model_df = rdf.groupby('parent_model').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        p_model_df['成功率'] = np.ceil(p_model_df['成功率']*100*1000)/1000
        p_model_df = p_model_df.sort_values('成功率', ascending=False)

        p_brand_df = rdf.groupby('parent_brand').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        p_brand_df['成功率'] = np.ceil(p_brand_df['成功率']*100*1000)/1000
        p_brand_df = p_brand_df.sort_values('成功率', ascending=False)

        brand_df = rdf.groupby('brand').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        brand_df['成功率'] = np.ceil(brand_df['成功率']*100*1000)/1000
        
        model_df = rdf.groupby('model').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        model_df['成功率'] = model_df['成功率']*100
        
        auth_df = rdf.groupby('auth_method').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        auth_df['成功率'] = np.ceil(auth_df['成功率']*100*1000)/1000
        auth_df = auth_df.sort_values('成功率', ascending=False)
        
        daily_df = rdf.groupby('date').agg(成功率=('is_success','mean'), 成功数=('is_success','sum')).reset_index()
        daily_df['成功率'] = daily_df['成功率'] * 100
        daily_df = daily_df.sort_values('date')
        # 親機の連続招待（中日）分析
        rdf_sorted = rdf.sort_values(['parent_id', 'date']).copy()
        rdf_sorted['prev_date'] = rdf_sorted.groupby('parent_id')['date'].shift(1)
        rdf_sorted['days_since_last'] = (rdf_sorted['date'] - rdf_sorted['prev_date']).dt.days

        def categorize_interval(days):
            if pd.isna(days): return "初回/データなし"
            if days <= 0: return "同日(0日)"
            if days == 1: return "1日"
            if days == 2: return "2日"
            if days == 3: return "3日"
            if days <= 5: return "4〜5日"
            return "6日以上"

        rdf_sorted['interval_category'] = rdf_sorted['days_since_last'].apply(categorize_interval)
        
        interval_df = rdf_sorted.groupby('interval_category').agg(
            試行数=('is_success', 'count'),
            成功数=('is_success', 'sum'),
            成功率=('is_success', 'mean')
        ).reset_index()
        interval_df['成功率'] = np.ceil(interval_df['成功率'] * 100 * 1000) / 1000
        
        cat_order = ["同日(0日)", "1日", "2日", "3日", "4〜5日", "6日以上", "初回/データなし"]
        interval_df['order'] = interval_df['interval_category'].map(lambda x: cat_order.index(x) if x in cat_order else 99)
        interval_df = interval_df.sort_values('order').drop(columns=['order'])

        # 親機のステータス（連続失敗数）分析
        consecutive_failures_list = []
        current_streak = 0
        current_parent = None
        
        for idx, row in rdf_sorted.iterrows():
            if row['parent_id'] != current_parent:
                current_parent = row['parent_id']
                current_streak = 0
            
            # The status *before* this attempt
            consecutive_failures_list.append(current_streak)
            
            # Update streak for the *next* attempt
            if row['is_success']:
                current_streak = 0
            else:
                current_streak += 1
                
        rdf_sorted['prev_consecutive_failures'] = consecutive_failures_list
        def get_parent_status(failures):
            if failures == 0: return "🟢 健全 (連続失敗0回)"
            if failures == 1: return "🟡 注意 (連続失敗1回)"
            if failures == 2: return "🟠 警戒 (連続失敗2回)"
            return "🔴 危険 (連続失敗3回以上)"
            
        rdf_sorted['parent_status_before'] = rdf_sorted['prev_consecutive_failures'].apply(get_parent_status)
        
        parent_status_df = rdf_sorted.groupby('parent_status_before').agg(
            試行数=('is_success', 'count'),
            成功数=('is_success', 'sum'),
            成功率=('is_success', 'mean')
        ).reset_index()
        parent_status_df['成功率'] = np.ceil(parent_status_df['成功率'] * 100 * 1000) / 1000
        parent_status_df = parent_status_df.sort_values('parent_status_before')

        # 分析軸の候補: 表示ラベル → raw_df の名前付き列名（存在する列だけ入れる）
        axis_options = {}
        for label, col_name in (("招待種類", "invite_type"), ("親の種類", "parent_type"),
                                ("子種別", "child_type"), ("認証方法", "auth_method"),
                                ("稼働時間帯", "work_hours_band"), ("親ブランド", "parent_brand"),
                                ("子ブランド", "brand"), ("機種", "model"), ("親機種", "parent_model")):
            if col_name in rdf.columns:
                axis_options[label] = col_name

        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "model_rank": model_df, "daily_trend": daily_df,
            "parent_rank": parent_df, "parent_model_rank": p_model_df,
            "parent_brand_rank": p_brand_df, "top30_rank": top30_df,
            "interval_trend": interval_df, "parent_status_trend": parent_status_df,
            "auth_trend": auth_df,
            "axis_options": axis_options,
            "status_col": f_idx, # raw_df内の「状態」列の位置（名前解決済み）
            "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}",
            "raw_df": rdf # 相性・疲弊度分析用の生データフレームを格納
        }
        return None
    except Exception as e: return str(e)

# ==========================================
# 3.4 数珠分析タブ用データ取得（liteのみ・全期間）
# ==========================================
def fetch_juzu_raw_df(force=False):
    r"""数珠つなぎ運用（検証2列）の分析専用に、liteの全期間データを取得・整形する。

    「🔗 数珠分析」タブは対象アプリ選択（サイドバー）に関わらず常にliteデータを見る
    （数珠つなぎ運用はliteにのみ存在するため）。fetch_data_logicとは別に
    st.session_state.actual_res を汚さない独立関数として持つ。
    期間フィルタは行わない（全期間）。未来日付の除外のみ行う。
    戻り値: (raw_df または None, エラー文字列またはNone)
    """
    try:
        f_key = str(datetime.now().timestamp()) if force else None
        payload = fetch_api_data_raw("lite", force_key=f_key)
        if payload is None:
            return None, "APIに接続できませんでした（初回はサーバー起動に時間がかかります）。もう一度同期してください"
        if "analytics" not in payload:
            return None, "Invalid API Response"

        raw_data = payload['analytics']
        if not raw_data:
            return None, "No Data"

        cols = _resolve_analytics_columns(raw_data[0], "lite")
        if cols is not None:
            data_rows = raw_data[1:]
            if not data_rows:
                return None, "No Data"
            df = pd.DataFrame(data_rows)
            df = df.reindex(columns=range(len(raw_data[0])))
        else:
            cols = dict(FALLBACK_ANALYTICS_COLUMNS["lite"])
            df = pd.DataFrame(raw_data)

        if cols.get("verify2") is None:
            return None, "検証2列が見つかりません（liteシートのヘッダ構成が想定と異なります）"

        f_idx = cols["f"]
        j_idx = cols["j"]
        auth_idx = cols["auth"]
        date1_idx = cols["date1"]
        date2_idx = cols["date2"]
        q_idx = cols["q"]
        verify2_idx = cols["verify2"]
        work_hours_idx = cols["work_hours"]

        def parse_date(val):
            if not val or val == "" or val == "#REF!": return pd.NaT
            if isinstance(val, str) and "T" in val:
                try:
                    dt = pd.to_datetime(val)
                    if dt.tzinfo is not None:
                        return dt.tz_convert('Asia/Tokyo').tz_localize(None)
                    return dt
                except: pass
            if isinstance(val, str):
                clean = re.sub(r'\(.*?\)', '', val).strip()
                try:
                    if "月" in clean and "/" not in clean: return pd.NaT
                    dt = datetime.strptime(f"{datetime.now().year}/{clean}", "%Y/%m/%d")
                    if dt > datetime.now() + timedelta(days=1): dt = dt.replace(year=dt.year-1)
                    return dt
                except: pass
            try:
                dt = pd.to_datetime(val)
                if getattr(dt, 'tzinfo', None) is not None:
                    return dt.tz_convert('Asia/Tokyo').tz_localize(None)
                return dt
            except: return pd.NaT

        def get_valid_date(row):
            if len(row) > date1_idx:
                d1 = parse_date(row[date1_idx])
                if pd.notnull(d1) and d1.year > 1900: return d1
            if date2_idx is not None and len(row) > date2_idx:
                d2 = parse_date(row[date2_idx])
                if pd.notnull(d2) and d2.year > 1900: return d2
            return pd.NaT

        df['date'] = df.apply(get_valid_date, axis=1)
        status_series = df[f_idx].astype(str).str.strip()
        df['status'] = status_series
        df['is_success'] = status_series.str.contains("成功")
        df['is_failure'] = status_series.str.contains("失敗")
        df['model'] = df[j_idx].fillna("不明").astype(str).str.strip() if j_idx in df.columns else "不明"

        if auth_idx is not None and auth_idx in df.columns:
            auth_series = df[auth_idx].fillna("不明").astype(str).str.strip()
            auth_series = auth_series.str.replace(r'認証$', '', regex=True)
            df['auth_method'] = auth_series.where(auth_series != "", "未設定")
        else:
            df['auth_method'] = "未設定"

        verify2_series = df[verify2_idx].fillna("").astype(str).str.strip()
        df['verify2'] = verify2_series.where(verify2_series != "", "未設定")

        if q_idx is not None and q_idx in df.columns:
            df = df[~df[q_idx].astype(str).str.match(r'^\d{4}$')].copy()
            invite_vals = df[q_idx].fillna("").astype(str).str.strip()
            df['invite_type'] = invite_vals.where(invite_vals != "", "未設定")
        else:
            df['invite_type'] = "未設定"

        if work_hours_idx is not None and work_hours_idx in df.columns:
            wh_vals = df[work_hours_idx].fillna("").astype(str).str.strip()
            df['work_hours_band'] = wh_vals.where(wh_vals != "", "未設定")
        else:
            df['work_hours_band'] = "未設定"

        # 実測値: 「Tik開始」(date1)はISO日時だが時刻部分が常に00:00:00固定で
        # 時刻(hour)情報を持たない。実際の曜日・時刻は別の生列から取る:
        #   weekday_raw列 = 月/火/水/木/金/土/日 の日本語文字列（そのまま使う）
        #   hour_label列 = "14時" のような文字列（先頭の数字を時として取り出す）
        weekday_idx = cols.get("weekday_raw")
        if weekday_idx is not None and weekday_idx in df.columns:
            df['weekday_jp'] = df[weekday_idx].fillna("").astype(str).str.strip()
        else:
            df['weekday_jp'] = df['date'].dt.dayofweek.map(
                lambda i: ['月', '火', '水', '木', '金', '土', '日'][i] if pd.notnull(i) else None
            )

        hour_idx = cols.get("hour_label")
        if hour_idx is not None and hour_idx in df.columns:
            hour_raw = df[hour_idx].fillna("").astype(str).str.strip()
            df['hour_of_day'] = hour_raw.str.extract(r'(\d+)').iloc[:, 0]
            df['hour_of_day'] = pd.to_numeric(df['hour_of_day'], errors='coerce')
        else:
            df['hour_of_day'] = df['date'].dt.hour

        # 未来日付（スケジュール行など）を除外（JST基準）
        jst_now = datetime.utcnow() + timedelta(hours=9)
        df = df[df['date'] <= jst_now].copy()
        # 状態が「成功/失敗」以外（進行不可・空など）は成功率の分母から外れるが、
        # 件数系の表示のために行自体は残す。ここでは日付未確定行のみ除外する。
        df = df[df['date'].notna()].copy()

        if df.empty:
            return None, "No Data"

        return df, None
    except Exception as e:
        return None, str(e)

# ==========================================
# 3.5 中古相場タブ（イオシス連携）
# ==========================================
# 運用端末の機種リストは iosys.BUILTIN_MODEL_LIST（tools/update_iosys_snapshot.py が
# streamlit抜きで参照するため iosys.py 側に定義を置いている）。

# 販売相場の並列取得数。本番（Streamlit Cloud）で112機種×8並列を撃ったところ、
# 在庫があるはずの機種まで HTTP 200 のまま0件応答になる事象が出たため4へ下げた。
# （iosys.PAGE_SLEEP_SEC のページ間ウェイトと _jitter_sleep は各ワーカー内で効く）
IOSYS_MAX_WORKERS = 4

# 0件だった機種の再試行時の並列数。イオシス側に絞られている前提なので直列で撃つ。
IOSYS_RETRY_WORKERS = 1


def _fetch_one_model(model_name):
    """1機種分の販売相場を取得する（ワーカースレッドで実行される）。

    注意: この関数はスレッド内で呼ばれるため、st.* を一切呼んではいけない
    （StreamlitのScriptRunContextはワーカースレッドに無く、警告や誤動作の原因になる）。
    そのため @st.cache_data ではなく、素の iosys 呼び出しを使う。
    """
    items, used_query, error = iosys.search_with_fallback(model_name, max_pages=2)
    strict_items = iosys.filter_strict(items, iosys.normalize_model_name(model_name))
    return model_name, {
        "items": strict_items,
        "used_query": used_query,
        "error": error,
    }


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_sale_prices(model_names_tuple):
    """複数機種の販売相場をまとめて並列取得する。

    引数はハッシュ可能である必要があるため tuple で受け取る。
    ThreadPoolExecutor で並列化し、スレッド内では st.* を呼ばない。
    """
    model_names = list(model_names_tuple)
    if not model_names:
        return {}

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=IOSYS_MAX_WORKERS) as executor:
        future_map = {executor.submit(_fetch_one_model, name): name for name in model_names}
        for future in concurrent.futures.as_completed(future_map):
            name = future_map[future]
            try:
                model_name, data = future.result()
                results[model_name] = data
            except Exception as e:
                # 1機種の失敗で全体を落とさない
                results[name] = {"items": [], "used_query": name, "error": str(e)}

    # 1回目で0件だった機種だけ、全体完了後に直列で1回だけ再試行する。
    # 一斉アクセスで絞られただけなら、間隔を空けた再試行で取れることがある。
    zero_hit = [
        name for name in model_names
        if name in results and not results[name]["items"] and not results[name]["error"]
    ]
    if zero_hit:
        with concurrent.futures.ThreadPoolExecutor(max_workers=IOSYS_RETRY_WORKERS) as executor:
            retry_map = {executor.submit(_fetch_one_model, name): name for name in zero_hit}
            for future in concurrent.futures.as_completed(retry_map):
                name = retry_map[future]
                try:
                    model_name, data = future.result()
                    # 再試行で取れた場合だけ採用する（0件のままなら1回目の結果を残す）
                    if data["items"]:
                        data["retried"] = True
                        results[model_name] = data
                except Exception:
                    # 再試行の失敗は1回目の結果を維持するだけでよい
                    pass

    # 呼び出し順（元のリスト順）に整える
    return {name: results[name] for name in model_names if name in results}


@st.cache_data(ttl=600)
def _load_sale_snapshot():
    """同梱の販売相場スナップショットを読み込む薄いラッパー（kaitoriスナップショットと同じ発想）。

    iosys.load_sale_snapshot() 自体はファイルI/Oだけなので st.* は呼ばない。
    ttl=600はファイル更新（tools/update_iosys_snapshot.py の再実行→再デプロイ）を
    多少の遅延で拾えるようにするための保険で、通常は再デプロイ時にプロセスごと再起動される。
    """
    return iosys.load_sale_snapshot()


def _sale_prices_from_snapshot(snapshot, model_names):
    """スナップショットの内容を、_fetch_sale_prices と同じ戻り値の形へ整形する。

    スナップショットに存在しない機種（内蔵リスト更新後など）は
    items無し・エラー無しの0件扱いにする（従来のzero_hit扱いと同じ経路に乗る）。
    """
    snapshot_results = snapshot.get("results") or {}
    results = {}
    for name in model_names:
        data = snapshot_results.get(name)
        if data:
            results[name] = {
                "items": data.get("items") or [],
                "used_query": data.get("used_query") or name,
                "error": None,
            }
        else:
            results[name] = {"items": [], "used_query": name, "error": None}
    return results


@st.cache_data(ttl=3600, show_spinner=False)
def _fetch_kaitori_prices(model_names_tuple):
    """買取相場（イオシス買取）を取得し、機種ごとに集約する。

    本番（Streamlit Cloud）はAWSのIPから通信するため k-tai-iosys.com に
    全ブランド403で弾かれる。その場合は同梱スナップショットで補完する。

    戻り値: (matched: dict[機種名, 集約結果], errors: list[str], meta: dict)
    """
    model_names = list(model_names_tuple)
    if not model_names:
        return {}, [], {"used_snapshot": False, "snapshot_fetched_at": None,
                        "live_brands": [], "snapshot_brands": []}

    rows, errors, meta = kaitori.fetch_all_brands_with_fallback()
    matched = kaitori.match_models(model_names, rows)
    return matched, errors, meta


def render_used_market_tab():
    st.markdown("## 💴 中古相場（イオシス）")
    st.caption(
        "運用端末ごとの中古販売価格（今買うといくら）と買取価格（今売るといくら）。"
        "既定では同梱スナップショットを即時表示し、「🔄 相場を再取得」で最新のライブ相場を取り直せます。"
    )

    # 機種リストは内蔵リスト（iosys.BUILTIN_MODEL_LIST）のみ
    candidate_models = []
    seen = set()
    for name in iosys.BUILTIN_MODEL_LIST:
        norm = iosys.normalize_model_name(name)
        if norm and norm not in seen:
            seen.add(norm)
            candidate_models.append(norm)

    with st.expander(f"⚙️ 対象機種の絞り込み・再取得（内蔵リスト {len(candidate_models)} 機種）", expanded=False):
        # 内蔵リストが更新された場合もデフォルト全選択が効くよう、
        # 候補が変わったらウィジェットの保持状態を破棄して default を再適用する
        if st.session_state.get('iosys_model_options') != candidate_models:
            st.session_state.iosys_model_options = candidate_models
            st.session_state.pop('iosys_selected_models', None)
        selected_models = st.multiselect(
            "対象機種を選択", options=candidate_models, default=candidate_models, key="iosys_selected_models"
        )
        if st.button(
            "🔄 相場を再取得", disabled=(len(selected_models) == 0),
            help="スナップショットではなく、販売・買取の相場をその場でライブ取得し直します。",
        ):
            _fetch_sale_prices.clear()
            _fetch_kaitori_prices.clear()
            # 同一セッション中はライブ結果を優先する（スナップショットに戻さない）
            st.session_state.iosys_use_live = True

    if not selected_models:
        st.info("対象機種を1つ以上選択してください。")
        return

    models_key = tuple(selected_models)
    use_live = st.session_state.get("iosys_use_live", False)

    sale_snapshot = None if use_live else _load_sale_snapshot()

    if sale_snapshot:
        # 既定動作: スナップショットがあればライブ取得せずその内容を表示する
        results = _sale_prices_from_snapshot(sale_snapshot, selected_models)
        sale_fetched_at_raw = sale_snapshot.get("fetched_at") or ""
    else:
        # スナップショットが無い、またはボタンで明示的にライブ取得が選ばれた場合
        with st.spinner(f"販売相場を取得中…（{len(selected_models)}機種・初回は1分ほどかかります）"):
            results = _fetch_sale_prices(models_key)
        sale_fetched_at_raw = None

    with st.spinner("買取相場を取得中…（初回は10秒ほどかかります）"):
        kaitori_map, kaitori_errors, kaitori_meta = _fetch_kaitori_prices(models_key)

    st.session_state.iosys_results = results
    fetched_at = datetime.now()

    # スナップショットで補完した場合は基準日を控えておき、末尾の出典表記で明示する
    snapshot_date = None
    if kaitori_meta.get("used_snapshot"):
        raw = kaitori_meta.get("snapshot_fetched_at") or ""
        snapshot_date = raw[:10] or "取得日不明"
    elif kaitori_errors:
        # ライブで一部だけ落ち、スナップショットでも補えなかった場合
        st.warning("買取価格表の一部が取得できませんでした:\n" + "\n".join(f"- {e}" for e in kaitori_errors))

    if not results:
        return

    def _rank_bucket(rank_str):
        r = rank_str or ""
        if "未使用" in r:
            return "未使用"
        if "Aランク" in r or re.search(r'(?<![A-Za-z])A(?![A-Za-z])', r):
            return "Aランク"
        if "Bランク" in r or re.search(r'(?<![A-Za-z])B(?![A-Za-z])', r):
            return "Bランク"
        if "Cランク" in r or re.search(r'(?<![A-Za-z])C(?![A-Za-z])', r):
            return "Cランク"
        return "その他"

    summary_rows = []
    zero_hit_models = []
    for model_name, data in results.items():
        items = data["items"]
        error = data["error"]
        if error:
            zero_hit_models.append(f"{model_name}（エラー: {error}）")
            continue
        if not items:
            zero_hit_models.append(model_name)
            continue

        prices = sorted([it["price"] for it in items if it["price"] is not None])
        rank_min = {"未使用": None, "Aランク": None, "Bランク": None, "Cランク": None}
        for it in items:
            if it["price"] is None:
                continue
            bucket = _rank_bucket(it.get("rank"))
            if bucket in rank_min:
                if rank_min[bucket] is None or it["price"] < rank_min[bucket]:
                    rank_min[bucket] = it["price"]

        median_price = prices[len(prices)//2] if prices else None
        search_url = f"https://iosys.co.jp/items?q={urllib.parse.quote(data['used_query'])}"

        # 買取価格表に該当が無い機種（BASIO・Libero・android one 等）は None のままにする
        kaitori_data = kaitori_map.get(model_name) or {}

        summary_rows.append({
            "機種名": model_name,
            "検索語": data["used_query"],
            "ヒット件数": len(items),
            "最安値": prices[0] if prices else None,
            "中央値": median_price,
            "最高値": prices[-1] if prices else None,
            "未使用最安": rank_min["未使用"],
            "Aランク最安": rank_min["Aランク"],
            "Bランク最安": rank_min["Bランク"],
            "Cランク最安": rank_min["Cランク"],
            "検索ページ": search_url,
            "未使用買取": kaitori_data.get("unused_price"),
            "中古買取上限": kaitori_data.get("used_max"),
            "中古買取下限": kaitori_data.get("used_min"),
            "買取表ページ": kaitori_data.get("page_url"),
        })

    if summary_rows:
        summary_df = pd.DataFrame(summary_rows)

        # メイン表: 必要最小限の列 + 保有台数（保有台数だけ編集可）
        st.markdown("### 相場サマリ")
        qty_map = st.session_state.get('iosys_qty_map', {})
        main_df = summary_df[["機種名", "中央値", "最安値", "中古買取上限", "検索ページ"]].copy()
        main_df.insert(1, "保有台数", [int(qty_map.get(m, 1)) for m in main_df["機種名"]])

        # 機種の顔ぶれが変わったら編集状態を破棄する（行ずれ防止）
        if st.session_state.get('iosys_main_models') != list(main_df["機種名"]):
            st.session_state.iosys_main_models = list(main_df["機種名"])
            st.session_state.pop('iosys_main_editor', None)

        edited_df = st.data_editor(
            main_df,
            width="stretch",
            hide_index=True,
            disabled=["機種名", "中央値", "最安値", "中古買取上限", "検索ページ"],
            column_config={
                "保有台数": st.column_config.NumberColumn("保有台数", min_value=0, step=1),
                "中央値": st.column_config.NumberColumn("販売中央値", format="¥%d"),
                "最安値": st.column_config.NumberColumn("販売最安", format="¥%d"),
                "中古買取上限": st.column_config.NumberColumn("買取上限", format="¥%d"),
                "検索ページ": st.column_config.LinkColumn("イオシス", display_text="開く"),
            },
            key="iosys_main_editor",
        )
        st.session_state.iosys_qty_map = dict(zip(edited_df["機種名"], edited_df["保有台数"]))

        with st.expander("📊 詳細データ（ランク別最安・買取内訳）", expanded=False):
            st.dataframe(
                summary_df,
                width="stretch",
                hide_index=True,
                column_config={
                    "最安値": st.column_config.NumberColumn("最安値", format="¥%d"),
                    "中央値": st.column_config.NumberColumn("中央値", format="¥%d"),
                    "最高値": st.column_config.NumberColumn("最高値", format="¥%d"),
                    "未使用最安": st.column_config.NumberColumn("未使用最安", format="¥%d"),
                    "Aランク最安": st.column_config.NumberColumn("Aランク最安", format="¥%d"),
                    "Bランク最安": st.column_config.NumberColumn("Bランク最安", format="¥%d"),
                    "Cランク最安": st.column_config.NumberColumn("Cランク最安", format="¥%d"),
                    "検索ページ": st.column_config.LinkColumn("イオシス検索ページ", display_text="開く"),
                    "未使用買取": st.column_config.NumberColumn("未使用買取", format="¥%d"),
                    "中古買取上限": st.column_config.NumberColumn("中古買取上限", format="¥%d"),
                    "中古買取下限": st.column_config.NumberColumn("中古買取下限", format="¥%d"),
                    "買取表ページ": st.column_config.LinkColumn("買取表ページ", display_text="開く"),
                }
            )

        models_with_items = [m for m, d in results.items() if d["items"]]
        if models_with_items:
            with st.expander("🔍 機種ごとの個別商品一覧", expanded=False):
                pick = st.selectbox("機種を選択", models_with_items, key="iosys_detail_model")
                if pick and pick in results:
                    detail_df = pd.DataFrame([
                        {"商品名": it["name"], "ランク": it["rank"], "税込価格": it["price"], "商品ページ": it["url"]}
                        for it in results[pick]["items"]
                    ])
                    st.dataframe(
                        detail_df,
                        width="stretch",
                        hide_index=True,
                        column_config={
                            "税込価格": st.column_config.NumberColumn("税込価格", format="¥%d"),
                            "商品ページ": st.column_config.LinkColumn("商品ページ", display_text="開く"),
                        }
                    )

    if zero_hit_models:
        with st.expander(f"⚠️ 該当商品が0件だった機種（{len(zero_hit_models)}件）", expanded=False):
            st.markdown("\n".join(f"- {m}" for m in zero_hit_models))

    if fetched_at:
        if sale_fetched_at_raw:
            # スナップショット由来の日時は "YYYY-MM-DDTHH:MM:SS+09:00" 形式。
            # "YYYY-MM-DD HH:MM" までを取り出して表示する（タイムゾーン以降は捨てる）。
            date_part = sale_fetched_at_raw[:10]
            time_part = sale_fetched_at_raw[11:16]
            sale_note = (
                f"販売価格=イオシス（{date_part} {time_part}時点のスナップショット）"
                if time_part else f"販売価格=イオシス（{date_part}時点のスナップショット）"
            )
        else:
            sale_note = f"販売価格=イオシス（{fetched_at.strftime('%Y-%m-%d %H:%M')}取得のライブ相場）"

        kaitori_note = (
            f"買取価格=イオシス買取（k-tai-iosys.com）の {snapshot_date} 時点スナップショット"
            if snapshot_date
            else "買取価格=イオシス買取（k-tai-iosys.com）"
        )
        st.caption(
            f"出典: {sale_note}／{kaitori_note}"
            f"・価格は税込・表示更新: {fetched_at.strftime('%Y-%m-%d %H:%M:%S')}"
        )


def save_settings_api(target_app):
    try:
        settings = {
            "invite_types": st.session_state.invite_types_df.to_json(orient='records'),
            "video_rewards": st.session_state.video_rewards_df.to_json(orient='records'),
            "checkin_rewards": st.session_state.checkin_rewards_df.to_json(orient='records'),
            "total_dev": str(st.session_state.get("total_dev", 1800)),
            "parent_dev": str(st.session_state.get("parent_dev", 300)),
            "success_rate": str(st.session_state.get("success_rate_val", 80)),
            "keep_success": str(st.session_state.get("keep_success_val", 100)),
            "keep_failure": str(st.session_state.get("keep_failure_val", 30)),
            "prep_hours": str(st.session_state.get("prep_hours", 300)),
            "p_gap_days": str(st.session_state.get("p_gap_days", 5)),
            "checkin_days": str(st.session_state.get("checkin_days", 14))
        }
        base_url = get_gas_url(target_app)
        if not base_url: return False
        url = f"{base_url}?app={target_app}"
        requests.post(url, data=json.dumps(settings), timeout=15)
        return True
    except Exception as e:
        st.error(f"設定の保存に失敗しました: {e}")
        return False

def load_settings_api(target_app):
    try:
        base_url = get_gas_url(target_app)
        if not base_url: return False
        url = f"{base_url}?app={target_app}"
        # GAS(WebApp)はコールドスタートで10秒を超えることがあるため長めに取る
        response = requests.get(url, timeout=25)
        if response.status_code == 200:
            settings = response.json()
            if not settings: return False
            
            def sync_ratio_local(df, cloud_json, key_col):
                if not cloud_json: return df
                # pandas 2系はread_jsonへの生JSON文字列をファイルパス扱いするためStringIOで包む
                cloud_df = pd.read_json(io.StringIO(cloud_json))
                if key_col not in cloud_df.columns or "運用比率(%)" not in cloud_df.columns: return df
                ratios = dict(zip(cloud_df[key_col], cloud_df["運用比率(%)"]))
                df["運用比率(%)"] = df[key_col].map(ratios).fillna(0.0)
                return df

            if "invite_types" in settings:
                st.session_state.invite_types_df = sync_ratio_local(st.session_state.invite_types_df, settings["invite_types"], "キャンペーン名")
            if "video_rewards" in settings:
                st.session_state.video_rewards_df = sync_ratio_local(st.session_state.video_rewards_df, settings["video_rewards"], "動画パターン名")
            if "checkin_rewards" in settings:
                cloud_checkin = pd.read_json(io.StringIO(settings["checkin_rewards"]))
                if not cloud_checkin.empty:
                    key = "チェックイン追加報酬名" if "チェックイン追加報酬名" in cloud_checkin.columns else "報酬名"
                    ratios = dict(zip(cloud_checkin[key], cloud_checkin["出現確率(%)"]))
                    st.session_state.checkin_rewards_df["出現確率(%)"] = st.session_state.checkin_rewards_df["チェックイン追加報酬名"].map(ratios).fillna(0.0)

            st.session_state.total_dev_val = int(settings.get("total_dev", 1800))
            st.session_state.parent_dev_val = int(settings.get("parent_dev", 300))
            st.session_state.success_rate_val = int(settings.get("success_rate", 80))
            st.session_state.keep_success_val = int(settings.get("keep_success", 100))
            st.session_state.keep_failure_val = int(settings.get("keep_failure", 30))
            st.session_state.prep_hours_val = int(settings.get("prep_hours", 300))
            st.session_state.p_gap_days_val = int(settings.get("p_gap_days", 5))
            st.session_state.checkin_days_val = int(settings.get("checkin_days", 14))
            return True
    except Exception as e:
        # 起動時に毎回呼ばれるため、一過性のネットワーク失敗は警告に留める（既定値で動作は継続する）
        st.warning(f"クラウド設定の読み込みに失敗したため、既定値で表示しています（再読み込みで再試行されます）: {e}")
        return False
    return False

# ==========================================
# 4. メイン・オーケストレーター
# ==========================================
def main():
    # --- バージョン管理 ---
    if st.session_state.get('version') != CURRENT_VERSION:
        st.session_state.clear()
        st.session_state.version = CURRENT_VERSION

    # --- アプリ選択 (Lite / 本家) ---
    st.sidebar.markdown("### 📊 分析対象アプリ")
    app_mode = st.sidebar.radio("対象データ", ["TikTok Lite", "TikTok 本家"])
    
    target_app = "lite" if app_mode == "TikTok Lite" else "original"

    if st.session_state.get('current_app_mode') != app_mode:
        st.session_state.current_app_mode = app_mode
        st.session_state.initialized = False
        st.session_state.actual_res = None

    # --- 初期化 ---
    # 常に必要な変数を定義
    default_vals = {
        "total_dev_val": 1800, "parent_dev_val": 300, "success_rate_val": 80, 
        "keep_success_val": 100, "keep_failure_val": 30,
        "prep_hours_val": 300, "p_gap_days_val": 5, "checkin_days_val": 14
    }
    for k, v in default_vals.items():
        if k not in st.session_state: st.session_state[k] = v

    if not st.session_state.get('initialized', False):
        st.session_state.invite_types_df = pd.DataFrame([
            {"キャンペーン名": "ブタ5000", "即時報酬": 5000, "完走報酬": 0, "運用比率(%)": 100.0},
            {"キャンペーン名": "ブタ2500", "即時報酬": 2500, "完走報酬": 2500, "運用比率(%)": 0.0},
            {"キャンペーン名": "QRコード招待", "即時報酬": 3000, "完走報酬": 0, "運用比率(%)": 0.0},
            {"キャンペーン名": "通常招待", "即時報酬": 0, "完走報酬": 5500, "運用比率(%)": 0.0},
            {"キャンペーン名": "ヒットチャレンジ", "即時報酬": 5500, "完走報酬": 0, "運用比率(%)": 0.0},
            {"キャンペーン名": "即招待", "即時報酬": 2800, "完走報酬": 0, "運用比率(%)": 0.0}
        ])
        st.session_state.video_rewards_df = pd.DataFrame([
            {"動画パターン名": "なし", "報酬額": 0, "運用比率(%)": 0.0},
            {"動画パターン名": "特別1350", "報酬額": 1350, "運用比率(%)": 100.0},
            {"動画パターン名": "特別2700", "報酬額": 2700, "運用比率(%)": 0.0},
            {"動画パターン名": "特別6000", "報酬額": 6000, "運用比率(%)": 0.0}
        ])
        st.session_state.checkin_rewards_df = pd.DataFrame([
            {"チェックイン追加報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 40.0},
            {"チェックイン追加報酬名": "ティア2", "報酬額": 2700, "出現確率(%)": 40.0},
            {"チェックイン追加報酬名": "チェックイン特別報酬", "報酬額": 6750, "出現確率(%)": 20.0}
        ])
        load_settings_api(target_app)
        fetch_data_logic(target_app, "直近28日間", l_days=28)
        st.session_state.initialized = True

    if not st.session_state.get('initialized'):
        st.markdown("<h3 style='text-align:center; margin-top:100px;'>📊 Tik分析アプリ 起動中...</h3>", unsafe_allow_html=True)
        st.stop()

    apply_custom_styles()

    # --- サイドバー ---
    with st.sidebar:
        st.markdown("<h2 style='color:#0088ff;'>設定パネル</h2>", unsafe_allow_html=True)
        total_dev = st.number_input("総デバイス数", value=st.session_state.total_dev_val, key="total_dev")
        parent_dev = st.number_input("親デバイス数", value=st.session_state.parent_dev_val, key="parent_dev")
        st.markdown("---")
        success_p = st.slider("想定成功率 (%)", 0, 100, st.session_state.success_rate_val, step=1, key="success_rate_val") / 100
        keep_s = st.slider("成功時キープ率 (%)", 0, 100, st.session_state.keep_success_val, key="keep_success_val") / 100
        keep_f = st.slider("失敗時キープ率 (%)", 0, 100, st.session_state.keep_failure_val, key="keep_failure_val") / 100
        
        with st.expander("📝 稼働前提の詳細設定"):
            prep_hours = st.number_input("子端末 稼働準備時間 (h)", value=st.session_state.prep_hours_val, step=24, key="prep_hours")
            p_gap_days = st.number_input("親端末 使用間隔 (中n日)", value=st.session_state.p_gap_days_val, step=1, key="p_gap_days")
            checkin_days = st.number_input("チェックイン期間 (日間)", value=st.session_state.checkin_days_val, step=1, key="checkin_days")

        if st.sidebar.button("💾 クラウド保存", width="stretch"):
            if save_settings_api(target_app): st.sidebar.success("保存完了！")
            
        st.sidebar.markdown("<div style='height: 100px;'></div>", unsafe_allow_html=True)

    # --- 計算ロジック ---
    child_dev = total_dev - parent_dev
    prep_d = prep_hours / 24
    check_d = checkin_days
    p_cycle = p_gap_days + 1
    
    r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
    avg_cycle = ((prep_d + check_d) * r_keep) + ((prep_d + 1) * (1-r_keep))
    daily_parent_cap = parent_dev / p_cycle
    daily_child_cap = child_dev / avg_cycle
    actual_daily_invites = min(daily_parent_cap, daily_child_cap)

    c_inv = st.session_state.invite_types_df.fillna(0)
    w_imm = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
    w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)
    c_vid = st.session_state.video_rewards_df.fillna(0)
    w_vid = sum(c_vid["報酬額"] * c_vid.get("運用比率(%)", 0) / 100)
    c_check = st.session_state.checkin_rewards_df.fillna(0)
    w_check = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)
    
    # 期待収益の精密計算
    # 成功ルート: 即時報酬 + (成功キープ率 * (完走報酬 + チェックイン + 動画))
    success_rev = w_imm + (keep_s * (w_task + w_check + w_vid))
    # 失敗ルート: 失敗キープ率 * (チェックイン + 動画) ※招待報酬は入らない
    failure_rev = keep_f * (w_check + w_vid)
    
    per_invite_revenue = (success_p * success_rev) + ((1 - success_p) * failure_rev)

    # --- タブ表示 ---
    tabs = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "🔗 数珠分析", "👑 親機分析", "🧬 相性・疲弊度分析", "🔄 稼働シミュレーション", "💴 中古相場", "⚙️ 設定"])

    # 1. ダッシュボード
    with tabs[0]:
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
        
        st.markdown("<h2 style='margin-bottom:20px;'>概要</h2>", unsafe_allow_html=True)
        if datetime.now().hour >= 20:
            st.info("🌙 **20:00を過ぎました。本日の運用データが確定しています。**")
            res = st.session_state.get('actual_res')
            if res and 'daily_trend' in res:
                today_str = datetime.now().strftime('%Y-%m-%d')
                d_trend = res['daily_trend']
                d_trend['date_str'] = pd.to_datetime(d_trend['date']).dt.strftime('%Y-%m-%d')
                today_res = d_trend[d_trend['date_str'] == today_str]
                if not today_res.empty:
                    st.success(f"📈 **本日のリザルト**: 成功 **{today_res.iloc[0]['成功数']}台** / 成功率 **{today_res.iloc[0]['成功率']:.1f}%**")

        rev = actual_daily_invites * 30 * per_invite_revenue
        col1, col2, col3 = st.columns(3)
        with col1: custom_metric("予測月間収益", f"¥{int(rev):,}", f"1招待期待: ¥{int(per_invite_revenue):,}")
        with col2: custom_metric("1日あたりの招待予測", f"{actual_daily_invites:.1f}", f"最大成功: {actual_daily_invites*success_p:.1f}/日")
        with col3: custom_metric("リソース稼働率", f"{r_keep*100:.1f}%", "端末回転の健全性")

        st.markdown("---")
        st.markdown("### 📊 運用コンサルタントの定量アドバイス")
        advice = []
        # 基本ボトルネック
        if daily_parent_cap < daily_child_cap:
            req_p = int(np.ceil(daily_child_cap * p_cycle)); advice.append(f"🔴 <b>親端末の不足</b>: あと <b>{req_p - parent_dev} 台</b> 追加で収益 <b>¥{int((daily_child_cap - daily_parent_cap) * 30 * per_invite_revenue):,}</b> 増")
        else:
            req_c = int(np.ceil(daily_parent_cap * avg_cycle)); advice.append(f"🔵 <b>子端末の不足</b>: あと <b>{req_c - child_dev} 台</b> 追加で収益 <b>¥{int((daily_parent_cap - daily_child_cap) * 30 * per_invite_revenue):,}</b> 増")
        
        # 高度な分析 (実績ベース)
        if st.session_state.get('actual_res'):
            res = st.session_state.actual_res
            actual_s_rate = res['rate'] / 100
            gap = actual_s_rate - success_p
            if abs(gap) > 0.03:
                loss_gain = int(actual_daily_invites * 30 * gap * per_invite_revenue)
                if gap < 0: advice.append(f"⚠️ <b>成功率の下振れ注意</b>: 実績({actual_s_rate*100:.1f}%)が想定を下回っています。月間収益が予測より <b>¥{abs(loss_gain):,}</b> 減少するリスクがあります。")
                else: advice.append(f"✨ <b>想定以上のパフォーマンス</b>: 実績が想定を上回っています！ <b>¥{loss_gain:,}</b> のポジティブな上振れが期待できます。")
            
            if len(res['brand']) > 1:
                best_b, worst_b = res['brand'].loc[res['brand']['成功率'].idxmax()], res['brand'].loc[res['brand']['成功率'].idxmin()]
                if (best_b['成功率'] - worst_b['成功率']) > 5:
                    potential = int(actual_daily_invites * 30 * (best_b['成功率'] - worst_b['成功率'])/100 * per_invite_revenue * (worst_b['試行数']/res['total']))
                    advice.append(f"📱 <b>端末の最適化</b>: {worst_b['brand']} の成功率が低迷。{best_b['brand']} 並みに改善することで月間 <b>¥{potential:,}</b> の増収余地。")
            
            s_df = res['summary'].copy()
            if len(s_df) > 1:
                s_df['EV'] = (s_df['成功率']/100) * per_invite_revenue
                best_c = s_df.loc[s_df['EV'].idxmax()]
                if best_c['EV'] > (actual_s_rate * per_invite_revenue) * 1.05:
                    boost = int(actual_daily_invites * 30 * (best_c['EV'] - (actual_s_rate * per_invite_revenue)))
                    advice.append(f"🎯 <b>戦略の転換推奨</b>: 現在 <b>{best_c['招待種類']}</b> が最も効率的。シフトにより月間 <b>¥{boost:,}</b> 底上げ可能。")

            yield_val = int(rev / total_dev)
            advice.append(f"💰 <b>収益効率 (Yield)</b>: 端末1台あたり月間 <b>¥{yield_val:,}</b> を稼ぎ出しています。")
        
        st.markdown(f"<div class='advice-card'><div class='advice-title'>💎 定量アクションプラン</div><div class='advice-text'>{'<br><br>'.join(advice)}</div></div>", unsafe_allow_html=True)

    # 2. 実績分析 (折れ線グラフ復元)
    with tabs[1]:
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
            
        st.markdown("## リアルタイム実績分析")
        ac1, ac2, ac3 = st.columns([2,2,1])
        with ac1: fm = st.radio("期間", ["直近28日間", "月指定"], horizontal=True)
        with ac2:
            if fm == "直近28日間": ld, tm = 28, None
            else: tm = st.selectbox("対象月", [(datetime.now() - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)]); ld = None
        with ac3: st.write(""); sync = st.button("同期", width="stretch")
        if sync:
            with st.spinner("最新データを取得中..."):
                err = fetch_data_logic(target_app, fm, l_days=ld, t_month=tm, force=True)
                if err: st.error(f"同期失敗: {err}")
                else: st.success("同期成功！"); st.rerun()
        
        res = st.session_state.get('actual_res')
        if res:
            c1, c2, c3 = st.columns(3)
            with c1: custom_metric("総試行", f"{res['total']:,}")
            with c2: custom_metric("成功数", f"{res['success']:,}")
            with c3: custom_metric("成功率", f"{res['rate']:.3f}%")
            
            if 'auth_trend' in res and target_app == "original":
                st.markdown("### 🔐 子認証方法 (Google/LINE) の成功率比較")
                a_df = res['auth_trend'].sort_values('成功率', ascending=False)
                fig_auth = px.bar(a_df, x='成功率', y='auth_method', orientation='h', color='成功率', color_continuous_scale='Blues', text_auto='.2f')
                fig_auth.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=200)
                st.plotly_chart(fig_auth, width="stretch")
                
            st.markdown("### 📈 キャンペーン別 成功率ランキング")
            s_df = res['summary'].sort_values('成功率', ascending=False)
            fig = px.bar(s_df, x='成功率', y='招待種類', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.2f')
            fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=max(300, len(s_df)*40))
            st.plotly_chart(fig, width="stretch")

            # 🧭 軸別分析: 低カーディナリティ軸を選んで成功率を比較する
            axis_opts = res.get('axis_options', {})
            low_card_labels = [l for l in ("招待種類", "親の種類", "子種別", "認証方法", "稼働時間帯") if l in axis_opts]
            if low_card_labels and 'raw_df' in res:
                st.markdown("### 🧭 軸別分析")
                axis_label = st.selectbox("分析軸", low_card_labels, key="axis_analysis_axis")
                ax_df = _axis_summary(res['raw_df'], axis_opts[axis_label])
                if len(ax_df) <= 1:
                    only_val = ax_df.iloc[0][axis_opts[axis_label]] if len(ax_df) == 1 else "データなし"
                    st.caption(f"この軸は現在「{only_val}」の1種類のみです。種類が増えると自動で比較できるようになります。")
                else:
                    disp_ax = ax_df.rename(columns={axis_opts[axis_label]: axis_label})
                    fig_ax = px.bar(disp_ax, x='成功率', y=axis_label, orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.2f')
                    fig_ax.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=max(300, len(disp_ax)*40))
                    # key必須: 分析軸=招待種類のとき上のキャンペーン別グラフと同一パラメータになりIDが衝突するため
                    st.plotly_chart(fig_ax, width="stretch", key="axis_analysis_chart")
                    st.dataframe(
                        disp_ax, width="stretch", hide_index=True,
                        column_config={"成功率": st.column_config.NumberColumn("成功率", format="%.3f")},
                        key="axis_analysis_table",
                    )

            if "daily_trend" in res:
                st.markdown("### 📈 日次パフォーマンス・トレンド (成功数 × 成功率)")
                d_df = res['daily_trend']
                fig_comb = make_subplots(specs=[[{"secondary_y": True}]])
                fig_comb.add_trace(go.Bar(x=d_df['date'], y=d_df['成功数'], name="成功数 (台)", marker_color='rgba(0,136,255,0.6)'), secondary_y=False)
                fig_comb.add_trace(go.Scatter(x=d_df['date'], y=d_df['成功率'], name="成功率 (%)", line=dict(color='#00ff88', width=3), mode='lines+markers'), secondary_y=True)
                fig_comb.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=450, yaxis2=dict(range=[0, 100]))
                st.plotly_chart(fig_comb, width="stretch")


            st.markdown("---")
            st.markdown("## 📱 機種別パフォーマンス")
            if 'brand' in res:
                b_df = res['brand'].sort_values('成功率', ascending=False)
                fig = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0")
                st.plotly_chart(fig, width="stretch")
                if "model_rank" in res:
                    m_df = res['model_rank'].sort_values('成功率', ascending=False).copy()
                    m_df['成功率'] = m_df['成功率'].map('{:.2f}%'.format)
                    st.dataframe(m_df, width="stretch", hide_index=True)

    # 3. 数珠分析 (寝かせずに連続招待する「数珠つなぎ」運用の専用分析。lite固定・全期間)
    with tabs[2]:
        st.markdown("## 🔗 数珠分析")
        st.caption("「検証2」列が数珠のもの（寝かせずに連続招待した試行）を分析します。lite（TikTok Lite）データのみが対象です。")

        jc1, jc2 = st.columns([1, 4])
        with jc1:
            juzu_sync = st.button("🔄 数珠データ同期", key="juzu_sync_btn")
        if juzu_sync or 'juzu_raw_df' not in st.session_state:
            with st.spinner("liteの全期間データを取得中..."):
                _jdf, _jerr = fetch_juzu_raw_df(force=juzu_sync)
                st.session_state.juzu_raw_df = _jdf
                st.session_state.juzu_err = _jerr

        jdf_all = st.session_state.get('juzu_raw_df')
        jerr = st.session_state.get('juzu_err')

        if jdf_all is None or jdf_all.empty:
            st.warning(f"数珠分析用のliteデータを取得できませんでした: {jerr or 'データなし'}。「🔄 数珠データ同期」を押して再試行してください。")
        elif 'verify2' not in jdf_all.columns:
            st.warning("liteデータに「検証2」列が見つかりません。シート側の列構成をご確認ください。")
        else:
            juzu_df_base = jdf_all[jdf_all['verify2'] == '数珠'].copy()
            if juzu_df_base.empty:
                st.info("現在のliteデータに「数珠」の試行がありません。")
            else:
                # --- 共通フィルタ（このタブの全集計に効かせる） ---
                st.markdown("#### 🎛️ フィルタ")
                fc1, fc2, fc3 = st.columns(3)
                with fc1:
                    invite_opts = sorted(juzu_df_base['invite_type'].astype(str).unique().tolist())
                    sel_invite = st.multiselect("招待種類", invite_opts, default=invite_opts, key="juzu_f_invite")
                with fc2:
                    auth_opts = [a for a in sorted(juzu_df_base['auth_method'].astype(str).unique().tolist())]
                    sel_auth = st.multiselect("招待方法", auth_opts, default=auth_opts, key="juzu_f_auth")
                with fc3:
                    valid_dates = juzu_df_base['date'].dropna()
                    if not valid_dates.empty:
                        min_d, max_d = valid_dates.min().date(), valid_dates.max().date()
                        date_range = st.date_input("期間 (Tik開始)", value=(min_d, max_d), min_value=min_d, max_value=max_d, key="juzu_f_period")
                    else:
                        date_range = None

                jdf = juzu_df_base.copy()
                if sel_invite:
                    jdf = jdf[jdf['invite_type'].isin(sel_invite)]
                if sel_auth:
                    jdf = jdf[jdf['auth_method'].isin(sel_auth)]
                if date_range and isinstance(date_range, (tuple, list)) and len(date_range) == 2:
                    d0, d1 = date_range
                    jdf = jdf[(jdf['date'].dt.date >= d0) & (jdf['date'].dt.date <= d1)]

                if jdf.empty:
                    st.info("フィルタ条件に合致する数珠データがありません。フィルタを見直してください。")
                else:
                    # ===== 1. サマリーKPI =====
                    st.markdown("### 📌 サマリーKPI")
                    n_j, s_j, rate_j, lo_j, hi_j = _overall_rate_with_ci(jdf)

                    # 非数珠（初回/中3日/中4日/中5日/中6以上）との成功率差（フィルタ非依存・全期間ベース）
                    non_juzu_labels = ["初回", "中3日", "中4日", "中5日", "中6以上"]
                    non_juzu_df = jdf_all[jdf_all['verify2'].isin(non_juzu_labels)]
                    n_nj, s_nj, rate_nj, lo_nj, hi_nj = _overall_rate_with_ci(non_juzu_df)

                    # 直近30日成功率（フィルタ後のjdf基準）
                    jst_now = datetime.utcnow() + timedelta(hours=9)
                    recent_30 = jdf[jdf['date'] >= (jst_now - timedelta(days=30))]
                    n_r30, s_r30, rate_r30, lo_r30, hi_r30 = _overall_rate_with_ci(recent_30)

                    k1, k2, k3, k4 = st.columns(4)
                    with k1: custom_metric("数珠 試行数", f"{n_j:,}", f"成功 {s_j:,}件")
                    with k2: custom_metric("数珠 成功率", f"{rate_j:.1f}%", f"95%CI [{lo_j:.1f}–{hi_j:.1f}]")
                    with k3:
                        diff = rate_j - rate_nj if n_nj > 0 else None
                        diff_str = f"{diff:+.1f}pt" if diff is not None else "データなし"
                        custom_metric("非数珠との成功率差", diff_str, f"非数珠 {rate_nj:.1f}%（n={n_nj:,}）" if n_nj > 0 else "非数珠データなし")
                    with k4:
                        r30_str = f"{rate_r30:.1f}%" if n_r30 > 0 else "データなし"
                        custom_metric("直近30日 成功率", r30_str, f"n={n_r30:,}" if n_r30 > 0 else "")

                    st.markdown("---")

                    # ===== 2. 招待方法別分析（LINE vs Google認証） =====
                    st.markdown("### 📞 招待方法別分析（LINE vs Google認証）")
                    auth_ci_df = _rate_summary_with_ci(jdf, 'auth_method')
                    if auth_ci_df.empty:
                        st.info("招待方法の集計対象データがありません。")
                    else:
                        disp_auth = auth_ci_df.rename(columns={'auth_method': '招待方法'}).sort_values('成功率', ascending=False)
                        st.dataframe(
                            disp_auth, width="stretch", hide_index=True,
                            column_config={
                                "成功率": st.column_config.NumberColumn("成功率(%)", format="%.1f"),
                                "CI下限": st.column_config.NumberColumn("CI下限(%)", format="%.1f"),
                                "CI上限": st.column_config.NumberColumn("CI上限(%)", format="%.1f"),
                            },
                            key="juzu_auth_table",
                        )
                        fig_auth_ci = go.Figure()
                        fig_auth_ci.add_trace(go.Bar(
                            x=disp_auth['招待方法'], y=disp_auth['成功率'], name="成功率",
                            marker_color='rgba(0,136,255,0.7)',
                            error_y=dict(
                                type='data', symmetric=False,
                                array=disp_auth['CI上限'] - disp_auth['成功率'],
                                arrayminus=disp_auth['成功率'] - disp_auth['CI下限'],
                            ),
                            text=disp_auth.apply(lambda r: f"{r['成功率']:.1f}% (n={int(r['試行数'])})", axis=1),
                            textposition='outside',
                        ))
                        fig_auth_ci.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=350, yaxis=dict(range=[0, 100], title="成功率(%)"))
                        st.plotly_chart(fig_auth_ci, width="stretch", key="juzu_auth_chart")

                        # 機種×招待方法のクロス成功率表
                        st.markdown("#### 📱 機種 × 招待方法 クロス成功率")
                        cross_base = jdf[jdf['is_success'] | jdf['is_failure']].copy()
                        if cross_base.empty:
                            st.info("クロス集計の対象データがありません。")
                        else:
                            cross = cross_base.groupby(['model', 'auth_method']).agg(
                                試行数=('is_success', 'count'), 成功数=('is_success', 'sum')
                            ).reset_index()
                            cross['成功率'] = (cross['成功数'] / cross['試行数'] * 100).round(1)
                            pivot_rate = cross.pivot(index='model', columns='auth_method', values='成功率')
                            pivot_n = cross.pivot(index='model', columns='auth_method', values='試行数').fillna(0).astype(int)
                            model_totals = cross.groupby('model')['試行数'].sum().sort_values(ascending=False)
                            ordered_models = model_totals.index.tolist()
                            disp_cross = pd.DataFrame(index=ordered_models, columns=pivot_rate.columns)
                            for m in ordered_models:
                                for a in pivot_rate.columns:
                                    rate = pivot_rate.loc[m, a] if (m in pivot_rate.index and a in pivot_rate.columns) else np.nan
                                    cnt = pivot_n.loc[m, a] if (m in pivot_n.index and a in pivot_n.columns) else 0
                                    disp_cross.at[m, a] = f"{rate:.1f}% ({int(cnt)}件)" if pd.notnull(rate) else "-"
                            st.dataframe(disp_cross, width="stretch")

                        # 時刻×招待方法の成功率比較チャート
                        # 「Tik開始」は時刻部分が常に00:00固定のため使わず、実測の時刻専用列
                        # (hour_of_day、シート上の「時刻」列から抽出)を使う
                        st.markdown("#### 🕐 時刻 × 招待方法 成功率")
                        hour_base = jdf[(jdf['is_success'] | jdf['is_failure']) & jdf['hour_of_day'].notna()].copy()
                        if hour_base.empty:
                            st.info("時刻別集計の対象データがありません。")
                        else:
                            hour_base['hour'] = hour_base['hour_of_day'].astype(int)
                            hour_auth = hour_base.groupby(['hour', 'auth_method']).agg(
                                試行数=('is_success', 'count'), 成功数=('is_success', 'sum')
                            ).reset_index()
                            hour_auth['成功率'] = (hour_auth['成功数'] / hour_auth['試行数'] * 100).round(1)
                            fig_hour = go.Figure()
                            for a in sorted(hour_auth['auth_method'].unique()):
                                sub = hour_auth[hour_auth['auth_method'] == a].sort_values('hour')
                                fig_hour.add_trace(go.Scatter(
                                    x=sub['hour'], y=sub['成功率'], mode='lines+markers', name=a,
                                ))
                            fig_hour.update_layout(
                                plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0",
                                height=350, xaxis=dict(title="時刻(時)", dtick=1), yaxis=dict(title="成功率(%)", range=[0, 100]),
                            )
                            st.plotly_chart(fig_hour, width="stretch", key="juzu_hour_auth_chart")

                    st.markdown("---")

                    # ===== 3. 機種別成功率（n閾値可変） =====
                    st.markdown("### 📱 機種別成功率")
                    min_n = st.slider("最小試行数 (n以上のみ表示)", min_value=5, max_value=30, value=10, step=1, key="juzu_model_min_n")
                    model_ci_df = _rate_summary_with_ci(jdf, 'model')
                    model_ci_df = model_ci_df[model_ci_df['試行数'] >= min_n].sort_values('成功率', ascending=False)
                    if model_ci_df.empty:
                        st.info(f"試行数{min_n}件以上の機種データがありません。閾値を下げてください。")
                    else:
                        disp_model = model_ci_df.rename(columns={'model': '機種'})
                        fig_model = go.Figure()
                        fig_model.add_trace(go.Bar(
                            x=disp_model['成功率'], y=disp_model['機種'], orientation='h',
                            marker=dict(color=disp_model['成功率'], colorscale='RdYlGn', cmin=0, cmax=100),
                            error_x=dict(
                                type='data', symmetric=False,
                                array=disp_model['CI上限'] - disp_model['成功率'],
                                arrayminus=disp_model['成功率'] - disp_model['CI下限'],
                            ),
                            text=disp_model.apply(lambda r: f"{r['成功率']:.1f}% (n={int(r['試行数'])})", axis=1),
                            textposition='outside',
                        ))
                        fig_model.update_layout(
                            plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0",
                            height=max(300, len(disp_model) * 35), xaxis=dict(title="成功率(%)", range=[0, 105]),
                        )
                        st.plotly_chart(fig_model, width="stretch", key="juzu_model_chart")

                    st.markdown("---")

                    # ===== 4. 曜日×時刻ヒートマップ =====
                    # 「Tik開始」は時刻部分が常に00:00固定のため使わず、実測の曜日・時刻専用列
                    # (weekday_jp / hour_of_day、シート上の「曜日」「時刻」列そのもの)を使う
                    st.markdown("### 🗓️ 曜日 × 時刻 成功率ヒートマップ")
                    weekday_labels = ['月', '火', '水', '木', '金', '土', '日']
                    heat_base = jdf[(jdf['is_success'] | jdf['is_failure']) & jdf['hour_of_day'].notna() & jdf['weekday_jp'].isin(weekday_labels)].copy()
                    if heat_base.empty:
                        st.info("ヒートマップの対象データがありません。")
                    else:
                        heat_base['weekday'] = heat_base['weekday_jp']
                        heat_base['hour'] = heat_base['hour_of_day'].astype(int)
                        heat_agg = heat_base.groupby(['weekday', 'hour']).agg(
                            試行数=('is_success', 'count'), 成功数=('is_success', 'sum')
                        ).reset_index()
                        heat_agg['成功率'] = heat_agg['成功数'] / heat_agg['試行数'] * 100

                        hours = list(range(24))
                        z = np.full((len(weekday_labels), len(hours)), np.nan)
                        n_mat = np.zeros((len(weekday_labels), len(hours)), dtype=int)
                        text_mat = [["" for _ in hours] for _ in weekday_labels]
                        for _, r in heat_agg.iterrows():
                            yi = weekday_labels.index(r['weekday'])
                            xi = hours.index(int(r['hour']))
                            n_mat[yi, xi] = int(r['試行数'])
                            if r['試行数'] < 5:
                                z[yi, xi] = np.nan  # n<5は信頼できないためグレー（データ無扱い）表示
                                text_mat[yi][xi] = f"n={int(r['試行数'])}(参考値)"
                            else:
                                z[yi, xi] = r['成功率']
                                text_mat[yi][xi] = f"{r['成功率']:.1f}%<br>(n={int(r['試行数'])})"

                        fig_heat_wt = go.Figure(data=go.Heatmap(
                            z=z, x=hours, y=weekday_labels, text=text_mat, hoverinfo="text",
                            colorscale='RdYlGn', zmin=0, zmax=100, xgap=2, ygap=2,
                            colorbar=dict(title="成功率(%)"),
                        ))
                        fig_heat_wt.update_layout(
                            plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0",
                            height=380, xaxis=dict(title="時刻(時)", dtick=1), yaxis=dict(title="曜日"),
                        )
                        st.plotly_chart(fig_heat_wt, width="stretch", key="juzu_weekday_hour_heatmap")
                        st.caption("グレー（データ無表示）のセルは試行数5件未満のため参考値です。数字だけ確認してください。")

                    st.markdown("---")

                    # ===== 5. 稼働時間帯別成功率 =====
                    st.markdown("### ⏱️ 稼働時間帯別成功率")
                    wh_ci_df = _rate_summary_with_ci(jdf, 'work_hours_band')
                    if wh_ci_df.empty:
                        st.info("稼働時間帯の集計対象データがありません。")
                    else:
                        def _band_start(v):
                            m = re.match(r'^(\d+)', str(v))
                            return int(m.group(1)) if m else float('inf')
                        wh_ci_df = wh_ci_df.sort_values('work_hours_band', key=lambda s: s.map(_band_start))
                        disp_wh = wh_ci_df.rename(columns={'work_hours_band': '稼働時間帯'})
                        fig_wh = px.bar(disp_wh, x='稼働時間帯', y='成功率', text=disp_wh.apply(lambda r: f"{r['成功率']:.1f}% (n={int(r['試行数'])})", axis=1))
                        fig_wh.update_traces(marker_color='rgba(0,255,136,0.6)', textposition='outside')
                        fig_wh.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=350, yaxis=dict(range=[0, 105], title="成功率(%)"))
                        st.plotly_chart(fig_wh, width="stretch", key="juzu_work_hours_chart")

                    st.markdown("---")

                    # ===== 6. 検証2区分の比較（フィルタ前の全lite行が対象） =====
                    st.markdown("### 🔁 検証2区分の比較（数珠 vs 寝かせ運用）")
                    st.caption("このセクションのみ、上のフィルタの影響を受けず全期間・全条件のlite全データを対象にします。")
                    verify2_order = ["数珠", "初回", "中3日", "中4日", "中5日", "中6以上"]
                    v2_ci_df = _rate_summary_with_ci(jdf_all[jdf_all['verify2'].isin(verify2_order)], 'verify2')
                    if v2_ci_df.empty:
                        st.info("検証2区分の比較データがありません。")
                    else:
                        v2_ci_df['_order'] = v2_ci_df['verify2'].map(lambda v: verify2_order.index(v) if v in verify2_order else 99)
                        v2_ci_df = v2_ci_df.sort_values('_order').drop(columns=['_order'])
                        disp_v2 = v2_ci_df.rename(columns={'verify2': '検証2区分'})
                        fig_v2 = go.Figure()
                        fig_v2.add_trace(go.Bar(
                            x=disp_v2['検証2区分'], y=disp_v2['成功率'],
                            marker_color=['#00ff88' if v == '数珠' else 'rgba(0,136,255,0.6)' for v in disp_v2['検証2区分']],
                            error_y=dict(
                                type='data', symmetric=False,
                                array=disp_v2['CI上限'] - disp_v2['成功率'],
                                arrayminus=disp_v2['成功率'] - disp_v2['CI下限'],
                            ),
                            text=disp_v2.apply(lambda r: f"{r['成功率']:.1f}% (n={int(r['試行数'])})", axis=1),
                            textposition='outside',
                        ))
                        fig_v2.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=380, yaxis=dict(range=[0, 100], title="成功率(%)"))
                        st.plotly_chart(fig_v2, width="stretch", key="juzu_verify2_compare_chart")
                        st.dataframe(
                            disp_v2, width="stretch", hide_index=True,
                            column_config={
                                "成功率": st.column_config.NumberColumn("成功率(%)", format="%.1f"),
                                "CI下限": st.column_config.NumberColumn("CI下限(%)", format="%.1f"),
                                "CI上限": st.column_config.NumberColumn("CI上限(%)", format="%.1f"),
                            },
                            key="juzu_verify2_compare_table",
                        )

    # 4. 親機分析 (アドバイス復元)
    with tabs[3]:
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
            
        st.markdown("## 👑 親機パフォーマンス分析")
        res = st.session_state.get('actual_res')
        if res and 'parent_rank' in res:
            # 親の種類（parent_type列を持つliteのみ）: parent_id -> 最頻値。列が無いアプリ(original)ではNoneのまま
            ptype_map = None
            if 'raw_df' in res and 'parent_type' in res['raw_df'].columns:
                ptype_map = _parent_type_map(res['raw_df'])

            # 連続招待（中日）の分析を表示
            if 'interval_trend' in res:
                st.markdown("### ⏳ 前回の招待からの経過日数 (中日) と成功率")
                st.write("「前回の招待（成功・失敗問わず）から何日空けて実行したか」ごとの成功率です。最適な寝かせ期間の特定に使えます。")
                i_df = res['interval_trend']
                fig_int = make_subplots(specs=[[{"secondary_y": True}]])
                fig_int.add_trace(go.Bar(x=i_df['interval_category'], y=i_df['試行数'], name="試行回数", marker_color='rgba(0,191,255,0.6)'), secondary_y=False)
                fig_int.add_trace(go.Scatter(x=i_df['interval_category'], y=i_df['成功率'], name="成功率 (%)", line=dict(color='#ffaa00', width=3), mode='lines+markers'), secondary_y=True)
                fig_int.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=350, yaxis2=dict(range=[0, 100]))
                st.plotly_chart(fig_int, width="stretch")
                st.markdown("---")
            
                
            # ブランド別集計を表示
            if 'parent_brand_rank' in res:
                st.markdown("### 🏷️ 親機ブランド別パフォーマンス")
                pb_df = res['parent_brand_rank'].sort_values('成功率', ascending=False)
                fig_pb = px.bar(pb_df, x='成功率', y='parent_brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.1f')
                fig_pb.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=300)
                st.plotly_chart(fig_pb, width="stretch")
            
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("### 🏆 個体別 (TOP10)")
                fig = px.bar(res['parent_rank'].head(10), x='成功率', y='parent_id', orientation='h', color='成功率', color_continuous_scale='Viridis', text_auto=True)
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', height=400)
                st.plotly_chart(fig, width="stretch")
                if ptype_map is not None:
                    # 親の種類列を持つアプリ(lite)だけ、TOP10の内訳表を添える
                    top10_df = res['parent_rank'].head(10)[['parent_id', '試行数', '成功数', '成功率']].copy()
                    top10_df.insert(1, '親の種類', top10_df['parent_id'].map(lambda p: ptype_map.get(p, "未設定")))
                    top10_df = top10_df.rename(columns={'parent_id': '親機ID'})
                    st.dataframe(
                        top10_df, width="stretch", hide_index=True,
                        column_config={"成功率": st.column_config.NumberColumn("成功率", format="%.3f")},
                        key="parent_top10_type_table",
                    )
            with c2:
                st.markdown("### 📱 機種別パフォーマンス (全体)")
                fig = px.bar(res['parent_model_rank'], x='成功率', y='parent_model', orientation='h', color='成功率', color_continuous_scale='Magma', text_auto=True)
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', height=400)
                st.plotly_chart(fig, width="stretch")
                
            st.markdown("### 🌟 直近で成功回数が多い端末トップ30")
            if 'top30_rank' in res:
                top_30_df = res['top30_rank'].head(30)
                if not top_30_df.empty:
                    display_df = top_30_df[['original_parent_id', 'parent_model', '成功数', '試行数', '成功率', '最終成功日']].copy()
                    display_df.columns = ['端末ID(親機)', '機種名', '成功回数', '試行回数', '成功率(%)', '直近成功日']
                    display_df.insert(0, '順位', range(1, len(display_df) + 1))
                    st.dataframe(display_df, width="stretch", hide_index=True)
            
            st.markdown("---")
            st.markdown("### ⚠️ 要警戒：低パフォーマンス親機 (ワースト10)")
            # 試行数3回以上の機種に絞って、成功率が低い順にソート
            low_p_df = res['parent_model_rank'][res['parent_model_rank']['試行数'] >= 3].sort_values('成功率', ascending=True).head(10).copy()
            if not low_p_df.empty:
                low_p_df['成功率'] = low_p_df['成功率'].map('{:.1f}%'.format)
                st.dataframe(low_p_df, width="stretch", hide_index=True)
            else:
                st.info("十分な試行数（3回以上）を持つ親機データがまだありません。")
            
            st.markdown("---")
            st.markdown("### 🚨 連続失敗アラート (親機)")
            
            if 'raw_df' in res:
                raw_df = res['raw_df']
                parent_groups = raw_df.groupby('parent_id')
                alert_parents = []
                for p_id, group in parent_groups:
                    if p_id == "未指定": continue
                    sorted_group = group.sort_values('date', ascending=False)
                    consecutive_failures = 0
                    for idx, row in sorted_group.iterrows():
                        if row['is_success']:
                            break
                        consecutive_failures += 1
                    
                    if consecutive_failures >= 2:
                        recent_n = sorted_group.head(max(3, consecutive_failures))
                        recent_dates = [d.strftime('%m/%d') if pd.notnull(d) else "不明" for d in recent_n['date']]
                        last_used = recent_dates[0] if recent_dates else "不明"
                        
                        # 初期化済みの可能性を判定（3連続以上失敗 かつ 最終利用から3日より経過）
                        latest_date = recent_n.iloc[0]['date']
                        is_initialized = False
                        if consecutive_failures >= 3 and pd.notnull(latest_date):
                            now_jst = datetime.utcnow() + timedelta(hours=9)
                            days_diff = (now_jst - latest_date).days
                            if days_diff > 3:
                                is_initialized = True
                                
                        if not is_initialized:
                            total_success = group['is_success'].sum()
                            entry = {
                                "親機ID": p_id,
                                "機種": group.iloc[0]['parent_model'],
                            }
                            if ptype_map is not None:
                                # 親の種類列を持つアプリ(lite)だけ列を足す（originalは従来どおり）
                                entry["親の種類"] = ptype_map.get(p_id, "未設定")
                            entry.update({
                                "連続失敗回数": f"{consecutive_failures}回",
                                "過去成功数": f"{total_success}回",
                                "最終利用日": last_used,
                                "直近履歴(日付)": " -> ".join(recent_dates),
                                "総試行数": len(group)
                            })
                            alert_parents.append(entry)
                
                if alert_parents:
                    alert_df = pd.DataFrame(alert_parents)
                    alert_df['_sort_val'] = alert_df['連続失敗回数'].str.replace('回','').astype(int)
                    alert_df = alert_df.sort_values(by=['_sort_val', '最終利用日'], ascending=[False, False]).drop(columns=['_sort_val'])
                    
                    c3 = len(alert_df[alert_df['連続失敗回数'].str.replace('回','').astype(int) >= 3])
                    c2 = len(alert_df[alert_df['連続失敗回数'].str.replace('回','').astype(int) == 2])
                    
                    st.error(f"⚠️ **3連続以上**: {c3}台 / **2連続**: {c2}台 が失敗しています。最終利用日を確認して休止間隔を見直してください。")
                    
                    if c3 > 0:
                        st.markdown("#### 🚨 危険: 3連続以上失敗している親機 (休止推奨)")
                        df_3 = alert_df[alert_df['連続失敗回数'].str.replace('回','').astype(int) >= 3]
                        st.dataframe(df_3, width="stretch", hide_index=True)
                        
                    if c2 > 0:
                        st.markdown("#### 🟡 警戒: 2連続失敗している親機 (次回失敗で休止検討)")
                        df_2 = alert_df[alert_df['連続失敗回数'].str.replace('回','').astype(int) == 2]
                        st.dataframe(df_2, width="stretch", hide_index=True)
                else:
                    st.success("✨ 現在、2回以上連続で失敗している親機はありません。")

            st.markdown("---")
            best_pm, worst_pm = res['parent_model_rank'].iloc[0], res['parent_model_rank'].iloc[-1]
            p_adv = f"- <b>最強の親機</b>: 現在 <b>{best_pm['parent_model']}</b> が成功率 <b>{best_pm['成功率']:.1f}%</b> でトップ。<br>- <b>要警戒</b>: <b>{worst_pm['parent_model']}</b> は成功率 <b>{worst_pm['成功率']:.1f}%</b> に留まる傾向。"
            st.markdown(f"<div class='advice-card' style='border-color: #ffd700;'><div class='advice-title'>💡 親機戦略のアドバイス</div><div class='advice-text'>{p_adv}</div></div>", unsafe_allow_html=True)

    # 6. 相性・疲弊度分析 (新タブ)
    with tabs[4]:
        import textwrap
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
            
        st.markdown("## 🧬 相性・疲弊度分析")
        
        if not res or 'raw_df' not in res:
            st.info("集計データがありません。「実績分析」タブでデータを同期してください。")
        else:
            raw_df = res['raw_df']
            
            # --- サブタブ分け ---
            sub_tabs = st.tabs(["🧩 親機×子機 相性マトリクス", "📱 子端末 疲弊度・シャドウバン警告"])
            
            # Sub-tab 1: 相性マトリクス
            with sub_tabs[0]:
                st.markdown("### 🧩 親機ブランド × 子機ブランド 相性マトリクス")
                st.write("親機ブランドと子機ブランドの組み合わせごとの成功率を表示します（赤：低成功率、緑：高成功率）。")
                
                # 軸の切り替え（既定は従来どおり 親ブランド×子ブランド）
                heat_axis_opts = res.get('axis_options') or {"親ブランド": "parent_brand", "子ブランド": "brand"}
                heat_labels = [l for l in ("親ブランド", "子ブランド", "親の種類", "子種別", "招待種類", "認証方法", "稼働時間帯") if l in heat_axis_opts]
                hx1, hx2 = st.columns(2)
                with hx1:
                    y_label = st.selectbox("縦軸", heat_labels,
                                           index=heat_labels.index("親ブランド") if "親ブランド" in heat_labels else 0,
                                           key="affinity_axis_y")
                with hx2:
                    x_label = st.selectbox("横軸", heat_labels,
                                           index=heat_labels.index("子ブランド") if "子ブランド" in heat_labels else 0,
                                           key="affinity_axis_x")
                y_col, x_col = heat_axis_opts[y_label], heat_axis_opts[x_label]

                if raw_df.empty:
                    st.info("十分なデータがありません。")
                elif y_col == x_col:
                    st.info("縦軸と横軸が同じです。別の軸を選んでください。")
                else:
                    # アドバイス文の呼び名（従来のデフォルト選択時と文言を一致させる）
                    y_word = "親機" if y_col == "parent_brand" else y_label
                    x_word = "子機" if x_col == "brand" else x_label
                    # 相性集計（数字のみの入力ノイズ値は両軸から除外）
                    y_vals = raw_df[y_col].astype(str).str.strip()
                    x_vals = raw_df[x_col].astype(str).str.strip()
                    noise_mask = ~y_vals.str.match(r'^\d+$') & ~x_vals.str.match(r'^\d+$')
                    heat_df = raw_df[noise_mask].copy()
                    heat_df[y_col] = y_vals[noise_mask]
                    heat_df[x_col] = x_vals[noise_mask]
                    affinity_df = heat_df.groupby([y_col, x_col]).agg(
                        試行数=('is_success', 'count'),
                        成功率=('is_success', 'mean')
                    ).reset_index()
                    affinity_df['成功率'] = affinity_df['成功率'] * 100
                    
                    # ピボット化
                    pivot_rate = affinity_df.pivot(index=y_col, columns=x_col, values='成功率')
                    pivot_count = affinity_df.pivot(index=y_col, columns=x_col, values='試行数').fillna(0).astype(int)
                    
                    y_labels = list(pivot_rate.index)
                    x_labels = list(pivot_rate.columns)
                    z_values = pivot_rate.values
                    
                    # テキスト用（成功率% と 試行数 をセットで表示）
                    text_values = []
                    for i, parent in enumerate(y_labels):
                        row_text = []
                        for j, child in enumerate(x_labels):
                            rate = z_values[i][j]
                            count = pivot_count.values[i][j]
                            if pd.isna(rate):
                                row_text.append("データ無")
                            else:
                                row_text.append(f"{rate:.1f}%<br>({count}回)")
                        text_values.append(row_text)
                        
                    fig_heat = go.Figure(data=go.Heatmap(
                        z=z_values,
                        x=x_labels,
                        y=y_labels,
                        text=text_values,
                        hoverinfo="text",
                        colorscale='RdYlGn',
                        zmin=0, zmax=100,
                        xgap=3, ygap=3
                    ))
                    fig_heat.update_layout(
                        plot_bgcolor='rgba(0,0,0,0)',
                        paper_bgcolor='rgba(0,0,0,0)',
                        font_color="#e0e0e0",
                        height=400,
                        margin=dict(t=30, b=30, l=30, r=30)
                    )
                    st.plotly_chart(fig_heat, width="stretch")
                    
                    st.markdown("---")
                    st.markdown("#### 📊 相性ピボット詳細テーブル")
                    styled_pivot = pd.DataFrame(index=y_labels, columns=x_labels)
                    for i, parent in enumerate(y_labels):
                        for j, child in enumerate(x_labels):
                            rate = z_values[i][j]
                            count = pivot_count.values[i][j]
                            if pd.isna(rate):
                                styled_pivot.at[parent, child] = "-"
                            else:
                                styled_pivot.at[parent, child] = f"{rate:.1f}% ({count}回)"
                                
                    st.dataframe(styled_pivot, width="stretch")
                    
                    # 試行数3以上のペアを抽出してアドバイス
                    valid_pairs = affinity_df[affinity_df['試行数'] >= 3].sort_values('成功率', ascending=False)
                    st.markdown("---")
                    st.markdown("#### 💡 相性アナリティクス推奨プラン")
                    if not valid_pairs.empty:
                        best_pair = valid_pairs.iloc[0]
                        worst_pair = valid_pairs.iloc[-1]
                        
                        advice_html = textwrap.dedent(f"""
                            <div class="advice-card" style="border-color: #00ff88;">
                                <div class="advice-title">🚀 推奨組み合わせ (試行数3回以上)</div>
                                <div class="advice-text">
                                    {y_word} <b>{best_pair[y_col]}</b> × {x_word} <b>{best_pair[x_col]}</b> が現在、成功率 <b>{best_pair['成功率']:.1f}%</b>（試行数: {best_pair['試行数']}回）で<b>トップ</b>です。この組み合わせを優先的に配置してください。
                                </div>
                            </div>
                        """)
                        if best_pair['成功率'] - worst_pair['成功率'] > 10:
                            advice_html += textwrap.dedent(f"""
                                <div class="advice-card" style="border-color: #ff3333; margin-top: 15px;">
                                    <div class="advice-title">⚠️ 警戒組み合わせ (試行数3回以上)</div>
                                    <div class="advice-text">
                                        {y_word} <b>{worst_pair[y_col]}</b> × {x_word} <b>{worst_pair[x_col]}</b> は成功率が <b>{worst_pair['成功率']:.1f}%</b>（試行数: {worst_pair['試行数']}回）と<b>著しく低迷</b>しています。この組み合わせでの運用は避けることを強く推奨します。
                                    </div>
                                </div>
                            """)
                        st.markdown(advice_html, unsafe_allow_html=True)
                    else:
                        st.info("相性推奨アドバイスを表示するには、試行数3回以上の組み合わせデータが必要です。")
            
            # Sub-tab 2: 子端末 疲弊度・シャドウバン警告
            with sub_tabs[1]:
                st.markdown("### 📱 子端末 疲弊度・シャドウバン警告")
                st.write("子端末ごとの連続失敗回数と全体成功率から、シャドウバンの危険度を算出します。")
                
                # 状態カラムの位置は fetch_data_logic がヘッダ名から解決した値を使う
                # （5 は旧実装の決め打ち値。古いセッション残骸へのフォールバック）
                f_idx = res.get('status_col', 5)
                if not raw_df.empty and 'child_id' in raw_df.columns:
                    child_groups = raw_df.groupby('child_id')
                    child_data = []
                    
                    for child_id, group in child_groups:
                        sorted_group = group.sort_values('date', ascending=False)
                        
                        consecutive_failures = 0
                        for idx, row in sorted_group.iterrows():
                            # 状態が成功（"成功"または"出金済み"を含む）ならカウントストップ
                            state_val = str(row[f_idx])
                            is_succ = "成功" in state_val or "出金済み" in state_val
                            if is_succ:
                                break
                            else:
                                consecutive_failures += 1
                                
                        total_trials = len(group)
                        succ_count = group['is_success'].sum()
                        succ_rate = (succ_count / total_trials) * 100
                        
                        # 危険度スコアの計算
                        # Risk = min(100, (Cf * 25) + max(0, (50 - Rs) * 1.2))
                        risk_score = (consecutive_failures * 25) + max(0.0, (50.0 - succ_rate) * 1.2)
                        risk_score = min(100.0, risk_score)
                        if total_trials < 3:
                            risk_score = risk_score * 0.5
                            
                        if risk_score < 35:
                            status = "🟢 健全"
                        elif risk_score < 70:
                            status = "🟡 注意"
                        else:
                            status = "🔴 要休止"
                            
                        # 直近3回の履歴をパース
                        recent_trials = sorted_group.head(3)
                        recent_history = []
                        for _, r in recent_trials.iterrows():
                            state = str(r[f_idx]) if r[f_idx] else "空欄"
                            recent_history.append("成功" if "成功" in state or "出金済み" in state else "失敗")
                        recent_str = " -> ".join(recent_history)
                            
                        child_data.append({
                            "端末番号": child_id,
                            "機種": group.iloc[0]['model'],
                            "総試行数": total_trials,
                            "成功数": succ_count,
                            "成功率": f"{succ_rate:.1f}%",
                            "直近連続失敗": f"{consecutive_failures}回",
                            "直近3履歴": recent_str,
                            "危険度スコア": risk_score,
                            "ステータス": status
                        })
                        
                    child_summary_df = pd.DataFrame(child_data)
                    child_summary_df = child_summary_df.sort_values("危険度スコア", ascending=False)
                    
                    total_devices = len(child_summary_df)
                    healthy_count = len(child_summary_df[child_summary_df['ステータス'] == "🟢 健全"])
                    warning_count = len(child_summary_df[child_summary_df['ステータス'] == "🟡 注意"])
                    critical_count = len(child_summary_df[child_summary_df['ステータス'] == "🔴 要休止"])
                    
                    cc1, cc2, cc3 = st.columns(3)
                    with cc1:
                        st.metric("🟢 健全な端末数", f"{healthy_count}台 / {total_devices}台", help="危険度35%未満の安定して稼働している端末")
                    with cc2:
                        st.metric("🟡 警戒中の端末数", f"{warning_count}台", help="危険度35%以上70%未満。やや挙動が怪しい端末")
                    with cc3:
                        st.metric("🔴 要休止・BAN端末数", f"{critical_count}台", help="危険度70%以上。シャドウバンの確率が極めて高い端末")
                        
                    st.markdown("---")
                    st.markdown("#### 📱 子端末 疲弊度ブラックリスト")
                    
                    disp_df = child_summary_df.copy()
                    disp_df["危険度スコア"] = disp_df["危険度スコア"].map("{:.1f}%".format)
                    
                    st.dataframe(
                        disp_df,
                        width="stretch",
                        hide_index=True,
                        column_config={
                            "危険度スコア": st.column_config.TextColumn("シャドウバン危険度", help="高いほどシャドウバン確率が高い"),
                            "ステータス": st.column_config.TextColumn("診断ステータス")
                        }
                    )
                    
                    critical_devices = child_summary_df[child_summary_df['ステータス'] == "🔴 要休止"]
                    warning_devices = child_summary_df[child_summary_df['ステータス'] == "🟡 注意"]
                    
                    st.markdown("---")
                    st.markdown("#### 💡 疲弊端末の具体的なメンテナンスアクション")
                    
                    if not critical_devices.empty:
                        reset_list = ", ".join([f"<b>#{row['端末番号']}</b> ({row['機種']})" for _, row in critical_devices.iterrows()])
                        st.markdown(textwrap.dedent(f"""
                            <div class="advice-card" style="border-color: #ff3333;">
                                <div class="advice-title">🔴 工場出荷状態リセット推奨 (シャドウバン確実)</div>
                                <div class="advice-text">
                                    以下の端末はシャドウバンされている確率が極めて高いです。リセットするか、最低でも7日間は完全に休止させてください。<br>
                                    対象端末: {reset_list}
                                </div>
                            </div>
                        """), unsafe_allow_html=True)
                        
                    if not warning_devices.empty:
                        ip_list = ", ".join([f"<b>#{row['端末番号']}</b>" for _, row in warning_devices.iterrows()])
                        st.markdown(textwrap.dedent(f"""
                            <div class="advice-card" style="border-color: #ffaa00; margin-top: 15px;">
                                <div class="advice-title">🟡 IP変更・キャッシュクリア推奨 (疲弊開始)</div>
                                <div class="advice-text">
                                    以下の端末は連続失敗が発生し始めています。次回運用の前に、接続回線のIP切り替え（機内モードON/OFFなど）やTikTok Liteのアプリキャッシュ削除を行ってください。<br>
                                    対象端末: {ip_list}
                                </div>
                            </div>
                        """), unsafe_allow_html=True)
                        
                    if critical_devices.empty and warning_devices.empty:
                        st.success("✨ 現在、すべての稼働端末が極めてクリーン（🟢 健全）な状態です！素晴らしい運用サイクルです。")
                else:
                    st.info("十分なデータがありません。")

    # 7. シミュレーション (内訳復元)
    with tabs[5]:
        st.markdown("## 🔄 稼働シミュレーション")
        st.markdown(f"<div style='background:#111; padding:20px; border-radius:10px; border-left:5px solid #0088ff;'>平均回転サイクル: <b>{avg_cycle:.2f} 日</b></div>", unsafe_allow_html=True)
        c1, c2, c3 = st.columns(3)
        with c1: custom_metric("1招待期待収益", f"¥{int(per_invite_revenue):,}")
        with c2: custom_metric("親の1日能力", f"{daily_parent_cap:.1f} 件")
        with c3: custom_metric("子の1日回転", f"{daily_child_cap:.1f} 件")
        st.markdown("---")
        st.markdown("### ⚙️ 回転戦略の詳細内訳")
        sc1, sc2 = st.columns(2)
        with sc1: st.markdown(f"<div style='background:#0a0a0a; padding:20px; border-radius:10px;'><b>✅ 成功時</b><br>確率: {success_p*100:.1f}%<br>拘束: {prep_d+check_d:.1f}日</div>", unsafe_allow_html=True)
        with sc2: st.markdown(f"<div style='background:#0a0a0a; padding:20px; border-radius:10px;'><b>❌ 失敗時</b><br>確率: {(1-success_p)*100:.1f}%<br>拘束: {(prep_d+check_d) if keep_f > 0 else (prep_d+1):.1f}日</div>", unsafe_allow_html=True)

    # 8. 中古相場
    with tabs[6]:
        render_used_market_tab()

    # 9. 設定 (SelectboxColumn復元)
    with tabs[7]:
        st.markdown("## ⚙️ 設定 (運用比率のみ編集可能)")
        col_cfg = {"運用比率(%)": st.column_config.SelectboxColumn("運用比率(%)", options=[float(i) for i in range(0, 110, 10)], required=True)}
        st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, width="stretch", disabled=["キャンペーン名", "即時報酬", "完走報酬"], column_config=col_cfg, key="ed_inv")
        st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, width="stretch", disabled=["動画パターン名", "報酬額"], column_config=col_cfg, key="ed_vid")
        st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, width="stretch", disabled=["チェックイン追加報酬名", "報酬額"], column_config={"出現確率(%)": st.column_config.SelectboxColumn("出現確率(%)", options=[float(i) for i in range(0, 110, 10)], required=True)}, key="ed_chk")
        if st.button("🚀 クラウドに保存", width="stretch"):
            if save_settings_api(target_app): st.success("スプレッドシートへ完全に同期しました！")
            
        st.markdown("<div style='height: 150px;'></div>", unsafe_allow_html=True)

    st.sidebar.markdown("---")
    st.sidebar.caption(f"Tik分析アプリ v{CURRENT_VERSION}")

if __name__ == "__main__":
    main()
