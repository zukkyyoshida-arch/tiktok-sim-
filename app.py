import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re
import json
import requests

# ページ設定
st.set_page_config(page_title="TikTok Studio Midnight v10.3", page_icon="🕶️", layout="wide", initial_sidebar_state="expanded")

# --- スプレッドシート連携 (GAS API) ロジック ---
GAS_URL = "https://script.google.com/macros/s/AKfycbwQuf80VDu7cqIaF2lM9CzIR1vFoDcFzxZzLU1rQakbgIgK6VW7c0EXtyQ8baZtaL3bzg/exec"

def save_settings_to_sheet():
    try:
        settings = {
            "invite_types": st.session_state.invite_types_df.to_json(orient='records'),
            "video_rewards": st.session_state.video_rewards_df.to_json(orient='records'),
            "checkin_rewards": st.session_state.checkin_rewards_df.to_json(orient='records'),
            "total_dev": str(st.session_state.get("total_dev", 1800)),
            "parent_dev": str(st.session_state.get("parent_dev", 300))
        }
        requests.post(GAS_URL, data=json.dumps(settings))
        return True
    except Exception as e:
        st.error(f"保存エラー: {e}")
        return False

def load_settings_from_sheet():
    try:
        response = requests.get(GAS_URL)
        if response.status_code == 200:
            settings = response.json()
            if not settings: return False
            if "invite_types" in settings: st.session_state.invite_types_df = pd.read_json(settings["invite_types"])
            if "video_rewards" in settings: st.session_state.video_rewards_df = pd.read_json(settings["video_rewards"])
            if "checkin_rewards" in settings: st.session_state.checkin_rewards_df = pd.read_json(settings["checkin_rewards"])
            st.session_state.total_dev_val = int(settings.get("total_dev", 1800))
            st.session_state.parent_dev_val = int(settings.get("parent_dev", 300))
            return True
    except: return False
    return False

# --- 初期化 ---
if 'initialized' not in st.session_state:
    st.session_state.invite_types_df = pd.DataFrame([
        {"キャンペーン名": "ブタ5000", "即時報酬": 5000, "完走報酬": 0, "運用比率(%)": 100.0},
        {"キャンペーン名": "ブタ2500", "即時報酬": 2500, "完走報酬": 2500, "運用比率(%)": 0.0},
        {"キャンペーン名": "QRコード招待", "即時報酬": 3000, "完走報酬": 0, "運用比率(%)": 0.0},
        {"キャンペーン名": "通常招待", "即時報酬": 0, "完走報酬": 5500, "運用比率(%)": 0.0},
        {"キャンペーン名": "ヒットチャレンジ", "即時報酬": 5500, "完走報酬": 0, "運用比率(%)": 0.0},
        {"キャンペーン名": "即招待", "即時報酬": 2800, "完走報酬": 0, "運用比率(%)": 0.0}
    ])
    st.session_state.video_rewards_df = pd.DataFrame([{"動画パターン名": "通常再生報酬", "報酬額": 1000, "有効": True}])
    st.session_state.checkin_rewards_df = pd.DataFrame([
        {"報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 40.0},
        {"報酬名": "ティア2", "報酬額": 2700, "出現確率(%)": 40.0},
        {"報酬名": "ティア3", "報酬額": 6750, "出現確率(%)": 20.0}
    ])
    st.session_state.total_dev_val = 1800
    st.session_state.parent_dev_val = 300
    load_settings_from_sheet()
    st.session_state.initialized = True
if 'actual_res' not in st.session_state: st.session_state.actual_res = None

# --- UI デザイン ---
st.markdown("""
    <style>
    .main { background-color: #000000; color: #e0e0e0; }
    .metric-container { background-color: #0a0a0a; padding: 24px; border-radius: 12px; border: 1px solid #1a1a1a; margin-bottom: 20px; }
    .metric-label { color: #888888; font-size: 0.85rem; font-weight: 600; }
    .metric-value { color: #ffffff; font-size: 2.2rem; font-weight: 700; }
    .advice-card { background-color: #050a15; padding: 24px; border-radius: 12px; border: 1px solid #0044ff; margin-bottom: 30px; }
    .advice-title { color: #0088ff; font-weight: 700; font-size: 1.2rem; margin-bottom: 12px; }
    </style>
    """, unsafe_allow_html=True)

def custom_metric(label, value, sub=""):
    st.markdown(f"<div class='metric-container'><div class='metric-label'>{label}</div><div class='metric-value'>{value}</div><div style='color:#00ff88;font-size:0.8rem;'>{sub}</div></div>", unsafe_allow_html=True)

with st.sidebar:
    st.markdown("<h2 style='color:#0088ff;'>設定パネル</h2>", unsafe_allow_html=True)
    total_dev = st.number_input("総デバイス数", value=st.session_state.total_dev_val, key="total_dev")
    parent_dev = st.number_input("親デバイス数", value=st.session_state.parent_dev_val, key="parent_dev")
    st.markdown("---")
    default_s = 80.0
    if st.session_state.actual_res: default_s = st.session_state.actual_res['rate']
    success_p = st.slider("想定成功率 (%)", 0, 100, int(round(default_s)), step=1) / 100
    keep_s = st.slider("成功時キープ率 (%)", 0, 100, 100) / 100
    keep_f = st.slider("失敗時キープ率 (%)", 0, 100, 30) / 100
    if st.sidebar.button("💾 クラウド保存", use_container_width=True):
        if save_settings_to_sheet(): st.sidebar.success("保存完了！")

# --- 計算 ---
child_dev = total_dev - parent_dev
prep_d = 12.5; check_d = 14; p_cycle = 6
r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
avg_cycle = ((prep_d + check_d) * r_keep) + ((prep_d + 1) * (1-r_keep))
daily_parent_cap = parent_dev / p_cycle
daily_child_cap = child_dev / avg_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)
c_inv = st.session_state.invite_types_df.fillna(0)
w_immediate = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)
c_check = st.session_state.checkin_rewards_df.fillna(0)
expected_checkin_reward = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)
per_invite_revenue = (w_immediate * success_p) + ((w_task + expected_checkin_reward + 1000) * r_keep)

def fetch_data(f_mode, l_days=None, t_month=None):
    sheet_id = "1R0PmlqcwTwQLuv_sDJ7UiMkpLBbBDdLzhV-hSUJllUQ"
    gid = "937207441"
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    try:
        df = pd.read_csv(url, header=4)
        f_col, l_col, q_col, j_col = df.columns[5], df.columns[11], df.columns[16], df.columns[9]
        def parse_date(date_str):
            if pd.isna(date_str) or not isinstance(date_str, str): return pd.NaT
            clean = re.sub(r'\(.*?\)', '', date_str).strip()
            try:
                dt = datetime.strptime(f"{datetime.now().year}/{clean}", "%Y/%m/%d")
                if dt > datetime.now() + timedelta(days=1): dt = dt.replace(year=dt.year-1)
                return dt
            except: return pd.NaT
        df['date'] = df[l_col].apply(parse_date)
        df['is_success'] = df[f_col].astype(str).str.contains("成功")
        df['model'] = df[j_col].fillna("不明")
        def get_brand(model_name):
            m = str(model_name).upper()
            if "XPERIA" in m: return "Xperia"
            if "AQUOS" in m or "SH-" in m: return "AQUOS"
            if "PIXEL" in m: return "Pixel"
            if "GALAXY" in m: return "Galaxy"
            if "IPHONE" in m: return "iPhone"
            if "OPPO" in m: return "OPPO"
            if "XIAOMI" in m: return "Xiaomi"
            return "その他"
        df['brand'] = df['model'].apply(get_brand)
        df = df[~df[q_col].astype(str).str.match(r'^\d{4}$')].copy()
        if f_mode == "直近28日間": rdf = df[df['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            rdf = df[(df['date'].dt.year == target_dt.year) & (df['date'].dt.month == target_dt.month)].copy()
        if len(rdf) == 0: return "No Data"
        
        sum_df = rdf.groupby(q_col).agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        sum_df['成功率'] = np.ceil(sum_df['成功率']*100*1000)/1000
        brand_df = rdf.groupby('brand').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        brand_df['成功率'] = np.ceil(brand_df['成功率']*100*1000)/1000
        model_df = rdf.groupby('model').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        model_df['成功率'] = model_df['成功率']*100
        
        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "model_rank": model_df, "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}"
        }
        return None
    except Exception as e: return str(e)

tab_dash, tab_analytics, tab_device, tab_sim, tab_config = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "📱 機種別分析", "🔄 稼働シミュレーション", "⚙️ 設定"])

with tab_dash:
    st.markdown("### 📊 運用コンサルタントの定量アドバイス")
    advice_content = []
    if daily_parent_cap < daily_child_cap:
        req_parent = int(np.ceil(daily_child_cap * p_cycle))
        shortage = req_parent - parent_dev
        advice_content.append(f"🔴 <b>親端末の不足 (ボトルネック)</b>: <b>あと {shortage} 台</b> の親を追加すれば、月間収益は約 <b>¥{int((daily_child_cap - daily_parent_cap) * 30 * per_invite_revenue):,}</b> 増加します。")
    else:
        req_child = int(np.ceil(daily_parent_cap * avg_cycle))
        shortage = req_child - child_dev
        advice_content.append(f"🔵 <b>子端末の不足</b>: <b>あと {shortage} 台</b> の子を追加すれば、月間収益を約 <b>¥{int((daily_parent_cap - daily_child_cap) * 30 * per_invite_revenue):,}</b> 上乗せできます。")
    st.markdown(f"<div class='advice-card'><div class='advice-title'>💎 定量アクションプラン</div><div class='advice-text'>{'<br><br>'.join(advice_content)}</div></div>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1: custom_metric("予測月間収益", f"¥{int(actual_daily_invites * 30 * per_invite_revenue):,}", f"1招待: ¥{int(per_invite_revenue):,}")
    with c2: custom_metric("1日招待予測", f"{actual_daily_invites:.1f} 件")
    with c3: custom_metric("リソース効率", f"{r_keep*100:.1f}%")

with tab_analytics:
    st.markdown("## リアルタイム実績分析")
    ac1, ac2, ac3 = st.columns([2,2,1])
    with ac1: f_m = st.radio("集計期間", ["直近28日間", "月指定"], horizontal=True, key="an_fmode")
    with ac2:
        if f_m == "直近28日間": l_d = 28; t_m = None
        else: t_m = st.selectbox("対象月", [(datetime.now() - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)], key="an_month"); l_d = None
    with ac3: st.write(""); btn_s = st.button("データを同期", use_container_width=True, key="an_sync")
    if btn_s: fetch_data(f_m, l_days=l_d, t_month=t_m)
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        st.markdown(f"**分析期間: {res['period']}**")
        mc1, mc2, mc3 = st.columns(3)
        with mc1: custom_metric("総試行数", f"{res['total']:,}")
        with mc2: custom_metric("成功数", f"{res['success']:,}")
        with mc3: custom_metric("平均成功率", f"{res['rate']:.3f}%")

with tab_device:
    st.markdown("## 📱 機種別パフォーマンス")
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        if "brand" in res:
            st.markdown("### 🏢 メーカー別成功率")
            b_df = res['brand'].sort_values('成功率', ascending=False)
            fig_brand = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
            fig_brand.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0")
            st.plotly_chart(fig_brand, use_container_width=True)
            
            if "model_rank" in res:
                st.markdown("---")
                st.markdown("### 🔍 詳細機種別成功率ランキング")
                m_df = res['model_rank'].sort_values('成功率', ascending=False)
                m_df = m_df[m_df['試行数'] >= 1] 
                display_m = m_df.copy()
                display_m['成功率'] = display_m['成功率'].map('{:.3f}%'.format)
                st.dataframe(display_m, use_container_width=True, hide_index=True)
        else: st.warning("「実績分析」タブでもう一度「データを同期」してください。")
    else: st.info("同期を行うと機種別の詳細分析が表示されます。")

with tab_config:
    st.markdown("## 報酬・種別設定")
    new_invite_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True, key="editor_invite_types")
    new_video_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True, key="editor_video_rewards")
    new_checkin_df = st.data_editor(st.session_state.checkin_rewards_df, num_rows="dynamic", use_container_width=True, key="editor_checkin_rewards")
    if not new_invite_df.equals(st.session_state.invite_types_df) or not new_video_df.equals(st.session_state.video_rewards_df) or not new_checkin_df.equals(st.session_state.checkin_rewards_df):
        st.session_state.invite_types_df = new_invite_df; st.session_state.video_rewards_df = new_video_df; st.session_state.checkin_rewards_df = new_checkin_df
    st.markdown("---")
    if st.button("🚀 スプレッドシートに同期・保存", use_container_width=True):
        if save_settings_to_sheet(): st.success("同期しました！")
