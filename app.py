import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import urllib.parse
from datetime import datetime, timedelta
import re
import json
import requests
from streamlit_autorefresh import st_autorefresh
from plotly.subplots import make_subplots
import iosys

# ==========================================
# 1. 定数・設定
# ==========================================
CURRENT_VERSION = "11.0.14"
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
    initial_sidebar_state="expanded"
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
    try:
        base_url = get_gas_url(target_app)
        if not base_url: return None
        url = f"{base_url}?action=get_analytics&app={target_app}"
        if force_key:
            url += f"&t={force_key}"
        response = requests.get(url, timeout=15)
        if response.status_code != 200: return None
        return response.json()
    except: return None

def fetch_data_logic(target_app, f_mode, l_days=None, t_month=None, force=False):
    try:
        f_key = str(datetime.now().timestamp()) if force else None
        payload = fetch_api_data_raw(target_app, force_key=f_key)
        if not payload or "analytics" not in payload: return "Invalid API Response"
        
        raw_data = payload['analytics']
        if not raw_data: return "No Data"
        
        df = pd.DataFrame(raw_data)
        if target_app == "original":
            f_idx, child_idx, j_idx, auth_idx, date1_idx, date2_idx, n_idx, q_idx = 3, 4, 7, 6, 8, 9, 10, 11
        else:
            f_idx, child_idx, j_idx, auth_idx, date1_idx, date2_idx, n_idx, q_idx = 3, 4, 5, None, 7, 13, 9, 10
            
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
            if len(row) > date2_idx:
                d2 = parse_date(row[date2_idx])
                if pd.notnull(d2) and d2.year > 1900: return d2
            return pd.NaT

        df['date'] = df.apply(get_valid_date, axis=1)
        df['is_success'] = df[f_idx].astype(str).str.contains("成功")
        df['model'] = df[j_idx].fillna("不明") if j_idx < len(df.columns) else "不明"
        
        if auth_idx is not None and auth_idx < len(df.columns):
            df['auth_method'] = df[auth_idx].fillna("不明").astype(str)
        else:
            df['auth_method'] = "未設定"
        
        d_raw = payload.get('terminals', [])
        if (not d_raw or len(d_raw) == 0) and target_app == "original":
            lite_payload = fetch_api_data_raw("lite", force_key=f_key)
            if lite_payload:
                d_raw = lite_payload.get('terminals', [])
        
        d_map = {str(row[3]): str(row[5]) for row in d_raw if len(row) > 5}
        
        if target_app == "original":
            # fetch 個人招待ID mapping from the new spreadsheet via csv
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
                            d_map[k0] = model
                        if pd.notnull(r.iloc[1]):
                            k1 = str(r.iloc[1]).strip()
                            if k1.endswith('.0'): k1 = k1[:-2]
                            d_map[k1] = model
            except Exception as e:
                print("Error fetching 個人招待ID:", e)
        
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
        rdf['child_id'] = rdf[4].fillna("未指定").astype(str) # 端末番号を子IDとして定義
        rdf = rdf[~rdf[q_idx].astype(str).str.match(r'^\d{4}$')].copy()

        # 集計
        sum_df = rdf.groupby(q_idx).agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
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

        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "model_rank": model_df, "daily_trend": daily_df,
            "parent_rank": parent_df, "parent_model_rank": p_model_df,
            "parent_brand_rank": p_brand_df, "top30_rank": top30_df,
            "interval_trend": interval_df, "parent_status_trend": parent_status_df,
            "auth_trend": auth_df,
            "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}",
            "raw_df": rdf # 相性・疲弊度分析用の生データフレームを格納
        }
        return None
    except Exception as e: return str(e)

# ==========================================
# 3.5 中古相場タブ（イオシス連携）
# ==========================================
DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1Rg8nMTOyU_MMe7wGS1ZbeqptTUFgRXoovy27bzq2zdY/edit"
MODEL_LIST_COLUMN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _extract_sheet_id(url_or_id):
    m = re.search(r'/d/([a-zA-Z0-9_-]+)', url_or_id)
    if m:
        return m.group(1)
    # すでにID単体が渡された場合
    if re.match(r'^[a-zA-Z0-9_-]+$', url_or_id.strip()):
        return url_or_id.strip()
    return None


@st.cache_data(ttl=600)
def _fetch_sheet_tab_names(sheet_id):
    """htmlview経由でスプレッドシート内の全タブ名を取得する（gvizの黙ったフォールバック対策）。
    非公開等で取得できない場合は None を返す（検証スキップの合図）。
    """
    try:
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/htmlview"
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            return None
        names = re.findall(r'items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"', resp.text)
        if not names:
            return None
        # レスポンスは既にUTF-8の実文字（"Tik管理_本家"等）でエスケープされていないため、
        # unicode_escapeデコードは不要（適用すると文字化けする）。
        # "\/" のようなJS向けスラッシュエスケープのみ元に戻す。
        return [n.replace('\\/', '/') for n in names]
    except Exception:
        return None


@st.cache_data(ttl=600)
def _fetch_model_list_from_sheet(sheet_id, sheet_tab_name, column_letter):
    """指定シート・指定タブ・指定列から機種名一覧を取得する。
    戻り値: (models: list[str], warning: str | None)
    """
    warning = None
    tab_names = _fetch_sheet_tab_names(sheet_id)
    if tab_names is not None and sheet_tab_name not in tab_names:
        warning = f"シートに『{sheet_tab_name}』タブが見つかりません。存在するタブ: {', '.join(tab_names)}"
        return [], warning

    try:
        encoded_tab = urllib.parse.quote(sheet_tab_name)
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={encoded_tab}"
        df = pd.read_csv(csv_url, header=None)
    except Exception as e:
        return [], f"スプレッドシートの読み込みに失敗しました: {e}"

    col_idx = MODEL_LIST_COLUMN_LETTERS.index(column_letter.upper())
    if col_idx >= len(df.columns):
        return [], f"指定列（{column_letter}列）がシートに存在しません"

    raw_values = df.iloc[:, col_idx].dropna().astype(str).tolist()

    # 1行目がヘッダらしき値なら除外
    header_like = {"機種", "機種名", "モデル", "model", "端末", "端末機種"}
    if raw_values and raw_values[0].strip() in header_like:
        raw_values = raw_values[1:]

    models = []
    seen = set()
    for v in raw_values:
        norm = iosys.normalize_model_name(v)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        models.append(norm)

    return models, warning


def _collect_models_from_actual_res():
    """実績分析で既に取得済みの生データフレーム（st.session_state.actual_res['raw_df']）から
    機種一覧を作るフォールバック。'model' と 'parent_model' の両列のユニーク値を使う。
    """
    res = st.session_state.get('actual_res')
    if not res or 'raw_df' not in res:
        return []
    rdf = res['raw_df']
    models = set()
    for col in ('model', 'parent_model'):
        if col in rdf.columns:
            for v in rdf[col].dropna().astype(str).tolist():
                norm = iosys.normalize_model_name(v)
                if not norm or norm in ("不明", "未指定"):
                    continue
                # 管理番号・ID等の数字のみの値はノイズとして除外（機種名にはアルファベットが含まれるはず）
                if not re.search(r'[A-Za-zぁ-んァ-ン一-龥]', norm):
                    continue
                models.add(norm)
    return sorted(models)


@st.cache_data(ttl=3600)
def _cached_search_with_fallback(model_name):
    return iosys.search_with_fallback(model_name, max_pages=2)


def render_used_market_tab():
    st.markdown("## 💴 中古相場（イオシス）")
    st.caption("運用端末の機種ごとに、株式会社イオシス（iosys.co.jp）の中古販売価格を一覧化します。")

    with st.expander("📋 機種リストの取得元", expanded=True):
        sheet_url = st.text_input("スプレッドシートURL / ID", value=DEFAULT_SHEET_URL, key="iosys_sheet_url")
        c1, c2 = st.columns(2)
        with c1:
            sheet_tab_name = st.text_input("タブ名", value="機種リスト", key="iosys_sheet_tab")
        with c2:
            column_letter = st.text_input("列（アルファベット）", value="C", key="iosys_sheet_col", max_chars=2)

        use_actual_fallback = st.toggle("実績データから機種を拾う", value=False, key="iosys_use_actual_fallback",
                                         help="スプレッドシートから機種リストが読めない場合に、実績分析で取得済みのデータ（model/parent_model列）から機種一覧を作ります。")

        sheet_models = []
        sheet_warning = None
        sheet_id = _extract_sheet_id(sheet_url.strip()) if sheet_url.strip() else None

        if sheet_id:
            col_letter_clean = (column_letter.strip().upper() or "C")[:1]
            sheet_models, sheet_warning = _fetch_model_list_from_sheet(sheet_id, sheet_tab_name.strip(), col_letter_clean)
            if sheet_warning:
                st.warning(sheet_warning)
        else:
            st.warning("スプレッドシートURL / IDを正しく入力してください。")

        candidate_models = list(sheet_models)
        if use_actual_fallback:
            actual_models = _collect_models_from_actual_res()
            for m in actual_models:
                if m not in candidate_models:
                    candidate_models.append(m)
            if not actual_models:
                st.caption("（実績データにはまだ機種情報がありません）")

        if candidate_models:
            st.caption(f"機種リストを {len(candidate_models)} 件検出しました。")
        else:
            st.info("機種リストが取得できていません。スプレッドシートの設定を確認するか、「実績データから機種を拾う」をONにしてください。")

        # 機種リストが後から読み込まれた場合もデフォルト全選択が効くよう、
        # 候補が変わったらウィジェットの保持状態を破棄して default を再適用する
        if st.session_state.get('iosys_model_options') != candidate_models:
            st.session_state.iosys_model_options = candidate_models
            st.session_state.pop('iosys_selected_models', None)
        selected_models = st.multiselect(
            "対象機種を選択", options=candidate_models, default=candidate_models, key="iosys_selected_models"
        )

    fetch_clicked = st.button("💴 相場を取得", use_container_width=True, disabled=(len(selected_models) == 0))

    if fetch_clicked:
        results = {}
        progress = st.progress(0.0, text="相場を取得しています…")
        total = len(selected_models)
        for i, model_name in enumerate(selected_models):
            items, used_query, error = _cached_search_with_fallback(model_name)
            strict_items = iosys.filter_strict(items, iosys.normalize_model_name(model_name))
            results[model_name] = {
                "items": strict_items,
                "used_query": used_query,
                "error": error,
            }
            progress.progress((i + 1) / total, text=f"相場を取得しています… ({i+1}/{total}) {model_name}")
        progress.empty()
        st.session_state.iosys_results = results
        st.session_state.iosys_fetched_at = datetime.now()

    results = st.session_state.get('iosys_results')
    if not results:
        return

    fetched_at = st.session_state.get('iosys_fetched_at')

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
        })

    if summary_rows:
        summary_df = pd.DataFrame(summary_rows)
        st.markdown("### 相場サマリ")
        st.dataframe(
            summary_df,
            use_container_width=True,
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
            }
        )

        st.markdown("### 保有台数と資産評価額")
        if 'iosys_qty_df' not in st.session_state or set(st.session_state.iosys_qty_df["機種名"]) != set(summary_df["機種名"]):
            st.session_state.iosys_qty_df = pd.DataFrame({
                "機種名": summary_df["機種名"],
                "保有台数": 1,
            })
        qty_df = st.data_editor(
            st.session_state.iosys_qty_df,
            use_container_width=True,
            disabled=["機種名"],
            column_config={"保有台数": st.column_config.NumberColumn("保有台数", min_value=0, step=1)},
            key="iosys_qty_editor",
            hide_index=True,
        )
        st.session_state.iosys_qty_df = qty_df

        merged = qty_df.merge(summary_df[["機種名", "中央値"]], on="機種名", how="left")
        merged["評価額"] = merged["中央値"].fillna(0) * merged["保有台数"].fillna(0)
        total_value = int(merged["評価額"].sum())
        custom_metric("資産評価額の合計（中央値×台数）", f"¥{total_value:,}")

        st.markdown("### 機種ごとの個別商品一覧")
        for model_name, data in results.items():
            items = data["items"]
            if not items:
                continue
            with st.expander(f"{model_name}（{len(items)}件）"):
                detail_df = pd.DataFrame([
                    {"商品名": it["name"], "ランク": it["rank"], "税込価格": it["price"], "商品ページ": it["url"]}
                    for it in items
                ])
                st.dataframe(
                    detail_df,
                    use_container_width=True,
                    hide_index=True,
                    column_config={
                        "税込価格": st.column_config.NumberColumn("税込価格", format="¥%d"),
                        "商品ページ": st.column_config.LinkColumn("商品ページ", display_text="開く"),
                    }
                )

    if zero_hit_models:
        st.warning(
            "以下の機種は該当商品が0件でした。機種名の表記を調整して再取得してください:\n"
            + "\n".join(f"- {m}" for m in zero_hit_models)
        )

    if fetched_at:
        st.caption(f"出典: イオシス（iosys.co.jp）・価格は税込・取得: {fetched_at.strftime('%Y-%m-%d %H:%M:%S')}")


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
    except: return False

def load_settings_api(target_app):
    try:
        base_url = get_gas_url(target_app)
        if not base_url: return False
        url = f"{base_url}?app={target_app}"
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            settings = response.json()
            if not settings: return False
            
            def sync_ratio_local(df, cloud_json, key_col):
                if not cloud_json: return df
                cloud_df = pd.read_json(cloud_json)
                if key_col not in cloud_df.columns or "運用比率(%)" not in cloud_df.columns: return df
                ratios = dict(zip(cloud_df[key_col], cloud_df["運用比率(%)"]))
                df["運用比率(%)"] = df[key_col].map(ratios).fillna(0.0)
                return df

            if "invite_types" in settings:
                st.session_state.invite_types_df = sync_ratio_local(st.session_state.invite_types_df, settings["invite_types"], "キャンペーン名")
            if "video_rewards" in settings:
                st.session_state.video_rewards_df = sync_ratio_local(st.session_state.video_rewards_df, settings["video_rewards"], "動画パターン名")
            if "checkin_rewards" in settings:
                cloud_checkin = pd.read_json(settings["checkin_rewards"])
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
    except: return False
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

        if st.sidebar.button("💾 クラウド保存", use_container_width=True):
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
    tabs = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "👑 親機分析", "🧬 相性・疲弊度分析", "🔄 稼働シミュレーション", "💴 中古相場", "⚙️ 設定"])

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
                    advice.append(f"🎯 <b>戦略の転換推奨</b>: 現在 <b>{best_c.iloc[0]}</b> が最も効率的。シフトにより月間 <b>¥{boost:,}</b> 底上げ可能。")

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
        with ac3: st.write(""); sync = st.button("同期", use_container_width=True)
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
                st.plotly_chart(fig_auth, use_container_width=True)
                
            st.markdown("### 📈 キャンペーン別 成功率ランキング")
            s_df = res['summary'].sort_values('成功率', ascending=False)
            fig = px.bar(s_df, x='成功率', y=s_df.columns[0], orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.2f')
            fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=max(300, len(s_df)*40))
            st.plotly_chart(fig, use_container_width=True)

            if "daily_trend" in res:
                st.markdown("### 📈 日次パフォーマンス・トレンド (成功数 × 成功率)")
                d_df = res['daily_trend']
                fig_comb = make_subplots(specs=[[{"secondary_y": True}]])
                fig_comb.add_trace(go.Bar(x=d_df['date'], y=d_df['成功数'], name="成功数 (台)", marker_color='rgba(0,136,255,0.6)'), secondary_y=False)
                fig_comb.add_trace(go.Scatter(x=d_df['date'], y=d_df['成功率'], name="成功率 (%)", line=dict(color='#00ff88', width=3), mode='lines+markers'), secondary_y=True)
                fig_comb.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=450, yaxis2=dict(range=[0, 100]))
                st.plotly_chart(fig_comb, use_container_width=True)


            st.markdown("---")
            st.markdown("## 📱 機種別パフォーマンス")
            if 'brand' in res:
                b_df = res['brand'].sort_values('成功率', ascending=False)
                fig = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0")
                st.plotly_chart(fig, use_container_width=True)
                if "model_rank" in res:
                    m_df = res['model_rank'].sort_values('成功率', ascending=False).copy()
                    m_df['成功率'] = m_df['成功率'].map('{:.2f}%'.format)
                    st.dataframe(m_df, use_container_width=True, hide_index=True)

    # 3. 親機分析 (アドバイス復元)
    with tabs[2]:
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
            
        st.markdown("## 👑 親機パフォーマンス分析")
        res = st.session_state.get('actual_res')
        if res and 'parent_rank' in res:
            # 連続招待（中日）の分析を表示
            if 'interval_trend' in res:
                st.markdown("### ⏳ 前回の招待からの経過日数 (中日) と成功率")
                st.write("「前回の招待（成功・失敗問わず）から何日空けて実行したか」ごとの成功率です。最適な寝かせ期間の特定に使えます。")
                i_df = res['interval_trend']
                fig_int = make_subplots(specs=[[{"secondary_y": True}]])
                fig_int.add_trace(go.Bar(x=i_df['interval_category'], y=i_df['試行数'], name="試行回数", marker_color='rgba(0,191,255,0.6)'), secondary_y=False)
                fig_int.add_trace(go.Scatter(x=i_df['interval_category'], y=i_df['成功率'], name="成功率 (%)", line=dict(color='#ffaa00', width=3), mode='lines+markers'), secondary_y=True)
                fig_int.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=350, yaxis2=dict(range=[0, 100]))
                st.plotly_chart(fig_int, use_container_width=True)
                st.markdown("---")
            
                
            # ブランド別集計を表示
            if 'parent_brand_rank' in res:
                st.markdown("### 🏷️ 親機ブランド別パフォーマンス")
                pb_df = res['parent_brand_rank'].sort_values('成功率', ascending=False)
                fig_pb = px.bar(pb_df, x='成功率', y='parent_brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.1f')
                fig_pb.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=300)
                st.plotly_chart(fig_pb, use_container_width=True)
            
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("### 🏆 個体別 (TOP10)")
                fig = px.bar(res['parent_rank'].head(10), x='成功率', y='parent_id', orientation='h', color='成功率', color_continuous_scale='Viridis', text_auto=True)
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', height=400)
                st.plotly_chart(fig, use_container_width=True)
            with c2:
                st.markdown("### 📱 機種別パフォーマンス (全体)")
                fig = px.bar(res['parent_model_rank'], x='成功率', y='parent_model', orientation='h', color='成功率', color_continuous_scale='Magma', text_auto=True)
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', height=400)
                st.plotly_chart(fig, use_container_width=True)
                
            st.markdown("### 🌟 直近で成功回数が多い端末トップ30")
            if 'top30_rank' in res:
                top_30_df = res['top30_rank'].head(30)
                if not top_30_df.empty:
                    display_df = top_30_df[['original_parent_id', 'parent_model', '成功数', '試行数', '成功率', '最終成功日']].copy()
                    display_df.columns = ['端末ID(親機)', '機種名', '成功回数', '試行回数', '成功率(%)', '直近成功日']
                    display_df.insert(0, '順位', range(1, len(display_df) + 1))
                    st.dataframe(display_df, use_container_width=True, hide_index=True)
            
            st.markdown("---")
            st.markdown("### ⚠️ 要警戒：低パフォーマンス親機 (ワースト10)")
            # 試行数3回以上の機種に絞って、成功率が低い順にソート
            low_p_df = res['parent_model_rank'][res['parent_model_rank']['試行数'] >= 3].sort_values('成功率', ascending=True).head(10).copy()
            if not low_p_df.empty:
                low_p_df['成功率'] = low_p_df['成功率'].map('{:.1f}%'.format)
                st.dataframe(low_p_df, use_container_width=True, hide_index=True)
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
                            alert_parents.append({
                                "親機ID": p_id,
                                "機種": group.iloc[0]['parent_model'],
                                "連続失敗回数": f"{consecutive_failures}回",
                                "過去成功数": f"{total_success}回",
                                "最終利用日": last_used,
                                "直近履歴(日付)": " -> ".join(recent_dates),
                                "総試行数": len(group)
                            })
                
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
                        st.dataframe(df_3, use_container_width=True, hide_index=True)
                        
                    if c2 > 0:
                        st.markdown("#### 🟡 警戒: 2連続失敗している親機 (次回失敗で休止検討)")
                        df_2 = alert_df[alert_df['連続失敗回数'].str.replace('回','').astype(int) == 2]
                        st.dataframe(df_2, use_container_width=True, hide_index=True)
                else:
                    st.success("✨ 現在、2回以上連続で失敗している親機はありません。")

            st.markdown("---")
            best_pm, worst_pm = res['parent_model_rank'].iloc[0], res['parent_model_rank'].iloc[-1]
            p_adv = f"- <b>最強の親機</b>: 現在 <b>{best_pm['parent_model']}</b> が成功率 <b>{best_pm['成功率']:.1f}%</b> でトップ。<br>- <b>要警戒</b>: <b>{worst_pm['parent_model']}</b> は成功率 <b>{worst_pm['成功率']:.1f}%</b> に留まる傾向。"
            st.markdown(f"<div class='advice-card' style='border-color: #ffd700;'><div class='advice-title'>💡 親機戦略のアドバイス</div><div class='advice-text'>{p_adv}</div></div>", unsafe_allow_html=True)

    # 5. 相性・疲弊度分析 (新タブ)
    with tabs[3]:
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
                
                if not raw_df.empty:
                    # 相性集計
                    affinity_df = raw_df.groupby(['parent_brand', 'brand']).agg(
                        試行数=('is_success', 'count'),
                        成功率=('is_success', 'mean')
                    ).reset_index()
                    affinity_df['成功率'] = affinity_df['成功率'] * 100
                    
                    # ピボット化
                    pivot_rate = affinity_df.pivot(index='parent_brand', columns='brand', values='成功率')
                    pivot_count = affinity_df.pivot(index='parent_brand', columns='brand', values='試行数').fillna(0).astype(int)
                    
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
                    st.plotly_chart(fig_heat, use_container_width=True)
                    
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
                                
                    st.dataframe(styled_pivot, use_container_width=True)
                    
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
                                    親機 <b>{best_pair['parent_brand']}</b> × 子機 <b>{best_pair['brand']}</b> が現在、成功率 <b>{best_pair['成功率']:.1f}%</b>（試行数: {best_pair['試行数']}回）で<b>トップ</b>です。この組み合わせを優先的に配置してください。
                                </div>
                            </div>
                        """)
                        if best_pair['成功率'] - worst_pair['成功率'] > 10:
                            advice_html += textwrap.dedent(f"""
                                <div class="advice-card" style="border-color: #ff3333; margin-top: 15px;">
                                    <div class="advice-title">⚠️ 警戒組み合わせ (試行数3回以上)</div>
                                    <div class="advice-text">
                                        親機 <b>{worst_pair['parent_brand']}</b> × 子機 <b>{worst_pair['brand']}</b> は成功率が <b>{worst_pair['成功率']:.1f}%</b>（試行数: {worst_pair['試行数']}回）と<b>著しく低迷</b>しています。この組み合わせでの運用は避けることを強く推奨します。
                                    </div>
                                </div>
                            """)
                        st.markdown(advice_html, unsafe_allow_html=True)
                    else:
                        st.info("相性推奨アドバイスを表示するには、試行数3回以上の組み合わせデータが必要です。")
                else:
                    st.info("十分なデータがありません。")
            
            # Sub-tab 2: 子端末 疲弊度・シャドウバン警告
            with sub_tabs[1]:
                st.markdown("### 📱 子端末 疲弊度・シャドウバン警告")
                st.write("子端末ごとの連続失敗回数と全体成功率から、シャドウバンの危険度を算出します。")
                
                f_idx = 5 # 状態カラムのインデックス
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
                        use_container_width=True,
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

    # 6. シミュレーション (内訳復元)
    with tabs[4]:
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

    # 7. 中古相場
    with tabs[5]:
        render_used_market_tab()

    # 8. 設定 (SelectboxColumn復元)
    with tabs[6]:
        st.markdown("## ⚙️ 設定 (運用比率のみ編集可能)")
        col_cfg = {"運用比率(%)": st.column_config.SelectboxColumn("運用比率(%)", options=[float(i) for i in range(0, 110, 10)], required=True)}
        st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, use_container_width=True, disabled=["キャンペーン名", "即時報酬", "完走報酬"], column_config=col_cfg, key="ed_inv")
        st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, use_container_width=True, disabled=["動画パターン名", "報酬額"], column_config=col_cfg, key="ed_vid")
        st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, use_container_width=True, disabled=["チェックイン追加報酬名", "報酬額"], column_config={"出現確率(%)": st.column_config.SelectboxColumn("出現確率(%)", options=[float(i) for i in range(0, 110, 10)], required=True)}, key="ed_chk")
        if st.button("🚀 クラウドに保存", use_container_width=True):
            if save_settings_api(target_app): st.success("スプレッドシートへ完全に同期しました！")
            
        st.markdown("<div style='height: 150px;'></div>", unsafe_allow_html=True)

    st.sidebar.markdown("---")
    st.sidebar.caption(f"Tik分析アプリ v{CURRENT_VERSION}")

if __name__ == "__main__":
    main()
