import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re
import json
import requests
from streamlit_autorefresh import st_autorefresh
from plotly.subplots import make_subplots

# ==========================================
# 1. 定数・設定
# ==========================================
CURRENT_VERSION = "11.0.12"
GAS_URL = "https://script.google.com/macros/s/AKfycbwKESR5v8tWIU5hHHuVNIVNSwC2RhBSxwct4SlCBTmaYgPo79GDiTBTDiKvq6b3um-Svg/exec"

# ページ設定
st.set_page_config(
    page_title="Midnight Analytics Platinum v11.0",
    page_icon="🕶️",
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
def fetch_api_data_raw(force_key=None):
    try:
        url = f"{GAS_URL}?action=get_analytics"
        if force_key:
            url += f"&t={force_key}"
        response = requests.get(url, timeout=15)
        if response.status_code != 200: return None
        return response.json()
    except: return None

def fetch_data_logic(f_mode, l_days=None, t_month=None, force=False):
    try:
        f_key = str(datetime.now().timestamp()) if force else None
        payload = fetch_api_data_raw(force_key=f_key)
        if not payload or "analytics" not in payload: return "Invalid API Response"
        
        raw_data = payload['analytics']
        if not raw_data: return "No Data"
        
        df = pd.DataFrame(raw_data)
        # カラムインデックス: 3:状態, 5:機種, 7:日付1, 13:日付2, 9:親, 10:招待種類
        f_idx, j_idx, n_idx, q_idx = 3, 5, 9, 10
        
        def parse_date(val):
            if not val or val == "" or val == "#REF!": return pd.NaT
            if isinstance(val, str) and "T" in val:
                try: return pd.to_datetime(val).tz_localize(None)
                except: pass
            if isinstance(val, str):
                clean = re.sub(r'\(.*?\)', '', val).strip()
                try:
                    if "月" in clean and "/" not in clean: return pd.NaT
                    dt = datetime.strptime(f"{datetime.now().year}/{clean}", "%Y/%m/%d")
                    if dt > datetime.now() + timedelta(days=1): dt = dt.replace(year=dt.year-1)
                    return dt
                except: pass
            try: return pd.to_datetime(val).tz_localize(None)
            except: return pd.NaT

        def get_valid_date(row):
            d1 = parse_date(row[7])
            if pd.notnull(d1) and d1.year > 1900: return d1
            if len(row) > 13:
                d2 = parse_date(row[13])
                if pd.notnull(d2) and d2.year > 1900: return d2
            return pd.NaT

        df['date'] = df.apply(get_valid_date, axis=1)
        df['is_success'] = df[f_idx].astype(str).str.contains("成功")
        df['model'] = df[j_idx].fillna("不明")
        
        d_raw = payload.get('terminals', [])
        d_map = {str(row[3]): str(row[5]) for row in d_raw if len(row) > 5}
        
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

        rdf['parent_id'] = rdf[n_idx].fillna("未指定").astype(str)
        rdf['parent_model'] = rdf['parent_id'].map(d_map).fillna("不明")

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
        
        parent_df = rdf.groupby('parent_id').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        parent_df['成功率'] = np.ceil(parent_df['成功率']*100*1000)/1000
        parent_df = parent_df[parent_df['試行数'] >= 3].sort_values('成功率', ascending=False)

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
        
        daily_df = rdf.groupby('date').agg(成功率=('is_success','mean'), 成功数=('is_success','sum')).reset_index()
        daily_df['成功率'] = daily_df['成功率'] * 100
        daily_df = daily_df.sort_values('date')

        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "model_rank": model_df, "daily_trend": daily_df,
            "parent_rank": parent_df, "parent_model_rank": p_model_df,
            "parent_brand_rank": p_brand_df,
            "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}",
            "raw_df": rdf # 相性・疲弊度分析用の生データフレームを格納
        }
        return None
    except Exception as e: return str(e)

def save_settings_api():
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
        requests.post(GAS_URL, data=json.dumps(settings), timeout=15)
        return True
    except: return False

def load_settings_api():
    try:
        response = requests.get(GAS_URL, timeout=10)
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

    # --- 初期化 ---
    # 常に必要な変数を定義
    default_vals = {
        "total_dev_val": 1800, "parent_dev_val": 300, "success_rate_val": 80, 
        "keep_success_val": 100, "keep_failure_val": 30,
        "prep_hours_val": 300, "p_gap_days_val": 5, "checkin_days_val": 14
    }
    for k, v in default_vals.items():
        if k not in st.session_state: st.session_state[k] = v

    if 'invite_types_df' not in st.session_state:
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
        load_settings_api()
        fetch_data_logic("直近28日間", l_days=28)
        st.session_state.initialized = True

    if not st.session_state.get('initialized'):
        st.markdown("<h3 style='text-align:center; margin-top:100px;'>🕶️ Midnight Analytics 起動中...</h3>", unsafe_allow_html=True)
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
            if save_settings_api(): st.sidebar.success("保存完了！")

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
    tabs = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "📱 機種別分析", "👑 親機分析", "🧬 相性・疲弊度分析", "🔄 稼働シミュレーション", "⚙️ 設定"])

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
                err = fetch_data_logic(fm, l_days=ld, t_month=tm, force=True)
                if err: st.error(f"同期失敗: {err}")
                else: st.success("同期成功！"); st.rerun()
        
        res = st.session_state.get('actual_res')
        if res:
            c1, c2, c3 = st.columns(3)
            with c1: custom_metric("総試行", f"{res['total']:,}")
            with c2: custom_metric("成功数", f"{res['success']:,}")
            with c3: custom_metric("成功率", f"{res['rate']:.3f}%")
            
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

    # 3. 機種別分析 (テーブル復元)
    with tabs[2]:
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
            
        st.markdown("## 📱 機種別パフォーマンス")
        res = st.session_state.get('actual_res')
        if res and 'brand' in res:
            b_df = res['brand'].sort_values('成功率', ascending=False)
            fig = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
            fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0")
            st.plotly_chart(fig, use_container_width=True)
            if "model_rank" in res:
                m_df = res['model_rank'].sort_values('成功率', ascending=False).copy()
                m_df['成功率'] = m_df['成功率'].map('{:.2f}%'.format)
                st.dataframe(m_df, use_container_width=True, hide_index=True)

    # 4. 親機分析 (アドバイス復元)
    with tabs[3]:
        res = st.session_state.get('actual_res')
        if res:
            st.caption(f"📊 分析対象期間: {res['period']}")
            
        st.markdown("## 👑 親機パフォーマンス分析")
        res = st.session_state.get('actual_res')
        if res and 'parent_rank' in res:
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
                        alert_parents.append({
                            "親機ID": p_id,
                            "機種": group.iloc[0]['parent_model'],
                            "連続失敗回数": f"{consecutive_failures}回",
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
                    st.dataframe(alert_df, use_container_width=True, hide_index=True)
                else:
                    st.success("✨ 現在、2回以上連続で失敗している親機はありません。")

            st.markdown("---")
            best_pm, worst_pm = res['parent_model_rank'].iloc[0], res['parent_model_rank'].iloc[-1]
            p_adv = f"- <b>最強の親機</b>: 現在 <b>{best_pm['parent_model']}</b> が成功率 <b>{best_pm['成功率']:.1f}%</b> でトップ。<br>- <b>要警戒</b>: <b>{worst_pm['parent_model']}</b> は成功率 <b>{worst_pm['成功率']:.1f}%</b> に留まる傾向。"
            st.markdown(f"<div class='advice-card' style='border-color: #ffd700;'><div class='advice-title'>💡 親機戦略のアドバイス</div><div class='advice-text'>{p_adv}</div></div>", unsafe_allow_html=True)

    # 5. 相性・疲弊度分析 (新タブ)
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

    # 7. 設定 (SelectboxColumn復元)
    with tabs[6]:
        st.markdown("## ⚙️ 設定 (運用比率のみ編集可能)")
        col_cfg = {"運用比率(%)": st.column_config.SelectboxColumn("運用比率(%)", options=[float(i) for i in range(0, 110, 10)], required=True)}
        st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, use_container_width=True, disabled=["キャンペーン名", "即時報酬", "完走報酬"], column_config=col_cfg, key="ed_inv")
        st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, use_container_width=True, disabled=["動画パターン名", "報酬額"], column_config=col_cfg, key="ed_vid")
        st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, use_container_width=True, disabled=["チェックイン追加報酬名", "報酬額"], column_config={"出現確率(%)": st.column_config.SelectboxColumn("出現確率(%)", options=[float(i) for i in range(0, 110, 10)], required=True)}, key="ed_chk")
        if st.button("🚀 クラウドに保存", use_container_width=True):
            if save_settings_api(): st.success("スプレッドシートへ完全に同期しました！")

    st.sidebar.markdown("---")
    st.sidebar.caption(f"Midnight Platinum v{CURRENT_VERSION} | Fully Restored")

if __name__ == "__main__":
    main()
