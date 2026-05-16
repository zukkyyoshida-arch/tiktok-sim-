import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Analytics Midnight",
    page_icon="🕶️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- 漆黒のプレミアム・ダークモード CSS ---
st.markdown("""
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
    /* 全体背景とフォント */
    .main { background-color: #000000; color: #e0e0e0; font-family: 'Inter', sans-serif; }
    [data-testid="stSidebar"] { background-color: #050505; border-right: 1px solid #222222; }
    
    /* ヘッダー */
    .stApp header { background-color: transparent; }
    h1, h2, h3 { color: #ffffff; font-weight: 700; letter-spacing: -0.02em; }
    
    /* カスタム・メトリクス・タイル */
    .metric-container {
        background-color: #0a0a0a;
        padding: 24px;
        border-radius: 12px;
        border: 1px solid #1a1a1a;
        text-align: left;
        transition: border 0.3s ease;
    }
    .metric-container:hover { border-color: #333333; }
    .metric-label { color: #888888; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; }
    .metric-value { color: #ffffff; font-size: 2.2rem; font-weight: 700; line-height: 1.2; }
    .metric-sub { color: #00ff88; font-size: 0.8rem; margin-top: 4px; }
    
    /* タブのスタイル */
    .stTabs [data-baseweb="tab-list"] { gap: 20px; background-color: #000000; border-bottom: 1px solid #111111; }
    .stTabs [data-baseweb="tab"] {
        height: 48px; background-color: transparent; color: #666666; 
        font-weight: 600; font-size: 1rem; border: none;
    }
    .stTabs [aria-selected="true"] { color: #0088ff !important; border-bottom: 2px solid #0088ff !important; }

    /* 入力フォーム */
    .stNumberInput input, .stSelectbox div { background-color: #0a0a0a !important; color: white !important; border: 1px solid #222222 !important; }
    
    /* データテーブル */
    .stDataFrame { border: 1px solid #111111; border-radius: 8px; }
    
    /* ボタン */
    .stButton>button {
        background: linear-gradient(135deg, #0088ff 0%, #0044ff 100%);
        color: white; border-radius: 8px; border: none; padding: 10px 24px; font-weight: 600;
        box-shadow: 0 4px 15px rgba(0, 136, 255, 0.2);
    }
    </style>
    """, unsafe_allow_html=True)

def custom_metric(label, value, sub_text=""):
    st.markdown(f"""
        <div class="metric-container">
            <div class="metric-label">{label}</div>
            <div class="metric-value">{value}</div>
            <div class="metric-sub">{sub_text}</div>
        </div>
    """, unsafe_allow_html=True)

# --- セッション状態 ---
if 'invite_types_df' not in st.session_state:
    st.session_state.invite_types_df = pd.DataFrame([
        {"キャンペーン名": "ブタ5000", "即時報酬": 5000, "完走報酬": 0, "運用比率(%)": 100.0},
        {"キャンペーン名": "ブタ2500", "即時報酬": 2500, "完走報酬": 2500, "運用比率(%)": 0.0},
        {"キャンペーン名": "QRコード招待", "即時報酬": 3000, "完走報酬": 0, "運用比率(%)": 0.0},
        {"キャンペーン名": "通常招待", "即時報酬": 0, "完走報酬": 5500, "運用比率(%)": 0.0},
        {"キャンペーン名": "ヒットチャレンジ", "即時報酬": 5500, "完走報酬": 0, "運用比率(%)": 0.0},
        {"キャンペーン名": "即招待", "即時報酬": 2800, "完走報酬": 0, "運用比率(%)": 0.0}
    ])
if 'video_rewards_df' not in st.session_state:
    st.session_state.video_rewards_df = pd.DataFrame([
        {"動画パターン名": "通常再生報酬", "報酬額": 1000, "有効": True}
    ])
if 'checkin_rewards_df' not in st.session_state:
    st.session_state.checkin_rewards_df = pd.DataFrame([
        {"報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 40.0},
        {"報酬名": "ティア2", "報酬額": 2700, "出現確率(%)": 40.0},
        {"報酬名": "ティア3", "報酬額": 6750, "出現確率(%)": 20.0}
    ])
if 'actual_res' not in st.session_state: st.session_state.actual_res = None

# --- ロジック ---
def fetch_data(f_mode, l_days=None, t_month=None):
    sheet_id = "1R0PmlqcwTwQLuv_sDJ7UiMkpLBbBDdLzhV-hSUJllUQ"
    gid = "937207441"
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    try:
        df = pd.read_csv(url, header=4)
        f_col, l_col, q_col = df.columns[5], df.columns[11], df.columns[16]
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
        df = df[~df[q_col].astype(str).str.match(r'^\d{4}$')].copy()
        if f_mode == "直近28日間":
            rdf = df[df['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            rdf = df[(df['date'].dt.year == target_dt.year) & (df['date'].dt.month == target_dt.month)].copy()
        if len(rdf) == 0: return "データなし"
        sum_df = rdf.groupby(q_col).agg(試行数=('is_success','count'), 成功数=('is_success','sum'), 成功率=('is_success','mean')).reset_index()
        sum_df['成功率'] = np.ceil(sum_df['成功率']*100*1000)/1000
        sum_df['運用比率'] = np.ceil((sum_df['試行数']/len(rdf))*100*1000)/1000
        daily = rdf.groupby(rdf['date'].dt.date).agg(試行数=('is_success','count'), 成功数=('is_success','sum')).reset_index()
        daily['成功率'] = (daily['成功数']/daily['試行数'])*100
        st.session_state.actual_res = {
            "summary": sum_df, "daily": daily, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y.%m.%d')} - {rdf['date'].max().strftime('%m.%d')}"
        }
        return None
    except Exception as e: return str(e)

# --- サイドバー ---
with st.sidebar:
    st.markdown("<h2 style='color:#0088ff; margin-bottom:20px;'>Midnight Analytics</h2>", unsafe_allow_html=True)
    st.markdown("### 📡 稼働規模")
    total_dev = st.number_input("総デバイス", value=1800)
    parent_dev = st.number_input("親デバイス", value=300)
    
    st.markdown("### 📊 シミュレーション値")
    default_s = 80.0
    if st.session_state.actual_res: default_s = st.session_state.actual_res['rate']
    success_p = st.slider("想定成功率", 0.0, 100.0, default_s) / 100
    keep_s = st.slider("成功キープ", 0, 100, 100) / 100
    keep_f = st.slider("失敗キープ", 0, 100, 30) / 100

# --- 計算 ---
child_dev = total_dev - parent_dev
r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
avg_cycle = (26.5 * r_keep) + (13.5 * (1-r_keep))
daily_inv = min(parent_dev/6, child_dev/avg_cycle)

# --- タブ ---
tab_dash, tab_analytics, tab_sim, tab_config = st.tabs(["Dashboard", "Analytics", "Operations", "Settings"])

with tab_dash:
    st.markdown("## Overall Performance")
    c1, c2, c3 = st.columns(3)
    with c1: custom_metric("Monthly Expected Revenue", f"¥{int(daily_inv * 30 * 8000):,}", "↑ 12% vs last month")
    with c2: custom_metric("Daily Avg Invitations", f"{daily_inv:.1f}", "Trials / Day")
    with c3: custom_metric("Resource Bottleneck", "Parent Devices" if parent_dev/6 < child_dev/avg_cycle else "Child Devices", "System Capacity Limit")
    
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("### ⚡ Quick Spot Simulation")
    qc1, qc2, qc3 = st.columns(3)
    with qc1: s_c = st.number_input("Ready Child Devices", value=50)
    with qc2: s_p = st.number_input("Ready Parent Devices", value=50)
    with qc3:
        s_inv = min(s_c, s_p)
        st.markdown(f"<div style='background:#111; padding:20px; border-radius:10px; border:1px solid #222;'>見込み収益: <span style='color:#00ff88; font-size:1.5rem; font-weight:700;'>¥{int(s_inv * 8000):,}</span></div>", unsafe_allow_html=True)

with tab_analytics:
    st.markdown("## Real-time Analytics")
    ac1, ac2, ac3 = st.columns([2,2,1])
    with ac1: f_m = st.radio("Range", ["直近28日間", "月指定"], horizontal=True)
    with ac2:
        if f_m == "直近28日間": l_d = 28; t_m = None
        else:
            months = [(datetime.now() - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)]
            t_m = st.selectbox("Month", months); l_d = None
    with ac3: st.write(""); st.write(""); btn_s = st.button("Sync Data", use_container_width=True)

    if btn_s: fetch_data(f_m, l_days=l_d, t_month=t_m)

    if st.session_state.actual_res:
        res = st.session_state.actual_res
        st.markdown(f"**Period: {res['period']}**")
        mc1, mc2, mc3 = st.columns(3)
        with mc1: custom_metric("Total Trials", f"{res['total']:,}")
        with mc2: custom_metric("Total Success", f"{res['success']:,}")
        with mc3: custom_metric("Avg Success Rate", f"{res['rate']:.3f}%")
        
        st.markdown("### Performance Trend")
        fig = px.area(res['daily'], x='date', y='試行数', color_discrete_sequence=['#0088ff'])
        fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#666", 
                          xaxis=dict(showgrid=False), yaxis=dict(showgrid=True, gridcolor="#111"))
        st.plotly_chart(fig, use_container_width=True)
        
        st.markdown("### Campaign Breakdown")
        df_p = res['summary'].sort_values('成功率', ascending=False)
        df_p['成功率'] = df_p['成功率'].map('{:.3f}%'.format)
        df_p['運用比率'] = df_p['運用比率'].map('{:.3f}%'.format)
        st.dataframe(df_p, use_container_width=True, hide_index=True)

with tab_sim:
    st.markdown("## Operational Strategy")
    st.info(f"Avg Rotation Cycle: {avg_cycle:.2f} Days")
    st.plotly_chart(px.bar(x=["Success-Keep", "Success-Reset", "Fail-Keep", "Fail-Reset"], 
                           y=[success_p*keep_s, success_p*(1-keep_s), (1-success_p)*keep_f, (1-success_p)*(1-keep_f)],
                           labels={'x': 'Strategy', 'y': 'Probability'},
                           color_discrete_sequence=['#00ff88']), use_container_width=True)

with tab_config:
    st.markdown("## Settings & Content")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, num_rows="dynamic", use_container_width=True)

st.sidebar.markdown("---")
st.sidebar.caption("Midnight Analytics Pro v6.0")
