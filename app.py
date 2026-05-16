import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Studio Pro",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- YouTube Studio デザインシステム ---
st.markdown("""
    <style>
    /* 全体背景 */
    .main { background-color: #0f0f0f; color: #ffffff; }
    
    /* カードデザイン */
    .metric-card {
        background-color: #1e1e1e;
        padding: 24px;
        border-radius: 12px;
        border: 1px solid #2d2d2d;
        margin-bottom: 20px;
    }
    
    /* メトリクス表示の調整 */
    div[data-testid="stMetric"] {
        background-color: #1e1e1e;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #333333;
    }
    div[data-testid="stMetricValue"] {
        font-size: 2.2rem !important;
        font-weight: 600 !important;
        color: #ffffff !important;
    }
    div[data-testid="stMetricLabel"] {
        font-size: 0.9rem !important;
        color: #aaaaaa !important;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    
    /* タブのカスタマイズ */
    .stTabs [data-baseweb="tab-list"] {
        gap: 24px;
        background-color: #0f0f0f;
    }
    .stTabs [data-baseweb="tab"] {
        height: 50px;
        background-color: transparent;
        color: #aaaaaa;
        font-weight: 500;
        border: none;
    }
    .stTabs [aria-selected="true"] {
        color: #ffffff !important;
        border-bottom: 3px solid #ff0000 !important;
    }
    
    /* ボタンのカスタマイズ */
    .stButton>button {
        background-color: #3ea6ff;
        color: #000000;
        font-weight: 600;
        border-radius: 20px;
        border: none;
        padding: 0.5rem 1.5rem;
    }
    .stButton>button:hover {
        background-color: #65b8ff;
    }
    </style>
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
        {"動画パターン名": "通常再生報酬", "報酬額": 1000, "有効": True},
        {"動画パターン名": "特別ボーナス", "報酬額": 1500, "有効": False}
    ])

if 'checkin_rewards_df' not in st.session_state:
    st.session_state.checkin_rewards_df = pd.DataFrame([
        {"報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 40.0},
        {"報酬名": "ティア2", "報酬額": 2700, "出現確率(%)": 40.0},
        {"報酬名": "ティア3", "報酬額": 6750, "出現確率(%)": 20.0}
    ])

if 'actual_res' not in st.session_state: st.session_state.actual_res = None

# --- 解析ロジック ---
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
        if f_mode == "直近N日間":
            recent_df = df[df['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            recent_df = df[(df['date'].dt.year == target_dt.year) & (df['date'].dt.month == target_dt.month)].copy()
        if len(recent_df) == 0: return "データなし"
        
        summary = recent_df.groupby(q_col).agg(試行数=('is_success','count'), 成功数=('is_success','sum'), 成功率=('is_success','mean')).reset_index()
        summary['成功率'] = np.ceil(summary['成功率'] * 100 * 1000) / 1000
        summary['運用比率'] = np.ceil((summary['試行数'] / len(recent_df)) * 100 * 1000) / 1000
        
        daily = recent_df.groupby(recent_df['date'].dt.date).agg(試行数=('is_success','count'), 成功数=('is_success','sum')).reset_index()
        daily['成功率'] = (daily['成功数'] / daily['試行数']) * 100
        
        st.session_state.actual_res = {
            "summary": summary, "daily": daily, "rate": np.ceil(recent_df['is_success'].mean()*100*1000)/1000,
            "total": len(recent_df), "success": recent_df['is_success'].sum(),
            "period": f"{recent_df['date'].min().strftime('%m/%d')} - {recent_df['date'].max().strftime('%m/%d')}"
        }
        return None
    except Exception as e: return f"Error: {e}"

def normalize_df(df, col):
    total = df[col].sum()
    if total == 0: df[col] = 100/len(df)
    else: df[col] = (df[col]/total)*100
    return df

# --- サイドバー (Channel Settings) ---
with st.sidebar:
    st.image("https://www.gstatic.com/youtube/img/creator/yt_studio_logo_white.png", width=180)
    st.markdown("### チャンネル設定 (端末構成)")
    total_dev = st.number_input("総端末数", value=1800)
    parent_dev = st.number_input("親端末数", value=300)
    child_dev = total_dev - parent_dev
    
    st.markdown("---")
    st.markdown("### 招待戦略パラメータ")
    default_s = 80.0
    if st.session_state.actual_res: default_s = st.session_state.actual_res['rate']
    success_p = st.slider("想定成功率 (%)", 0.0, 100.0, default_s) / 100
    keep_s = st.slider("成功キープ率 (%)", 0, 100, 100) / 100
    keep_f = st.slider("失敗キープ率 (%)", 0, 100, 30) / 100

# --- グローバルロジック ---
prep_d = 12.5; check_d = 14; p_cycle = 6
r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
avg_c_cycle = ((prep_d + check_d) * r_keep) + ((prep_d + 1) * (1-r_keep))
daily_cap_p = parent_dev / p_cycle
daily_cap_c = child_dev / avg_c_cycle
final_daily_invites = min(daily_cap_p, daily_cap_c)

# --- タブ (YouTube Studio Style) ---
tab_dash, tab_analytics, tab_sim, tab_content = st.tabs(["🏠 ダッシュボード", "📊 分析", "🔄 シミュレーション", "⚙️ 設定"])

with tab_dash:
    st.markdown("### チャンネルのダッシュボード")
    c1, c2, c3 = st.columns(3)
    with c1: st.metric("予測月間収益", f"¥{int(final_daily_invites * 30 * 8000):,}") # 概算
    with c2: st.metric("1日あたり招待予測", f"{final_daily_invites:.1f} 件")
    with c3: st.metric("ボトルネック", "親端末" if daily_cap_p < daily_cap_c else "子端末")

    st.markdown("---")
    st.markdown("#### 📍 クイック・スポット計算 (最新の稼働結果)")
    qc1, qc2, qc3 = st.columns(3)
    with qc1: s_child = st.number_input("本日利用可能な子端末", value=50)
    with qc2: s_parent = st.number_input("本日利用可能な親端末", value=int(daily_cap_p))
    with qc3:
        s_inv = min(s_child, s_parent)
        st.metric("本日の見込み収益", f"¥{int(s_inv * 8000):,}")

with tab_analytics:
    st.markdown("### チャンネル分析")
    ac1, ac2, ac3 = st.columns([2,2,1])
    with ac1: f_m = st.radio("期間", ["直近28日間", "月指定"], horizontal=True)
    with ac2:
        if f_m == "直近28日間": l_d = 28; t_m = None
        else:
            now = datetime.now()
            months = [(now - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)]
            t_m = st.selectbox("月", months); l_d = None
    with ac3: st.write(""); st.write(""); btn_s = st.button("更新", use_container_width=True)

    if btn_s:
        with st.spinner("データを読み込み中..."): fetch_data(f_m, l_days=l_d, t_month=t_m)

    if st.session_state.actual_res:
        res = st.session_state.actual_res
        st.markdown(f"**概要 ({res['period']})**")
        mc1, mc2, mc3 = st.columns(3)
        mc1.metric("総招待試行数", f"{res['total']:,}")
        mc2.metric("総成功数", f"{res['success']:,}")
        mc3.metric("平均成功率", f"{res['rate']:.3f}%")
        
        st.markdown("#### 推移グラフ")
        fig = px.area(res['daily'], x='date', y='試行数', color_discrete_sequence=['#ff0000'])
        fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#aaaaaa")
        st.plotly_chart(fig, use_container_width=True)
        
        st.markdown("#### キャンペーン別の掲載結果")
        df_p = res['summary'].sort_values('成功率', ascending=False)
        df_p['成功率'] = df_p['成功率'].map('{:.3f}%'.format)
        df_p['運用比率'] = df_p['運用比率'].map('{:.3f}%'.format)
        st.dataframe(df_p, use_container_width=True, hide_index=True)

with tab_sim:
    st.markdown("### 回転シミュレーション (詳細)")
    st.info(f"平均子端末回転サイクル: **{avg_c_cycle:.2f} 日**")
    sc1, sc2, sc3, sc4 = st.columns(4)
    sc1.metric("成功・キープ", f"{success_p*keep_s*100:.1f}%")
    sc2.metric("成功・即リセ", f"{success_p*(1-keep_s)*100:.1f}%")
    sc3.metric("失敗・キープ", f"{(1-success_p)*keep_f*100:.1f}%")
    sc4.metric("失敗・即リセ", f"{(1-success_p)*(1-keep_f)*100:.1f}%")

with tab_content:
    st.markdown("### コンテンツ設定 (報酬・種別)")
    st.markdown("#### 招待種別の設定")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    if st.button("比率を100%に補正 (招待)", key="n1"):
        st.session_state.invite_types_df = normalize_df(st.session_state.invite_types_df, "運用比率(%)"); st.rerun()
    
    st.markdown("#### 動画再生報酬")
    st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    
    st.markdown("#### チェックイン追加報酬")
    st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, num_rows="dynamic", use_container_width=True)
    if st.button("確率を100%に補正 (チェックイン)", key="n2"):
        st.session_state.checkin_rewards_df = normalize_df(st.session_state.checkin_rewards_df, "出現確率(%)"); st.rerun()

st.sidebar.markdown("---")
st.sidebar.caption("TikTok Studio v5.1 Platinum Edition")
