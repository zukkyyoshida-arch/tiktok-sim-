import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v2.1",
    page_icon="📱",
    layout="wide",
    initial_sidebar_state="expanded"
)

# スタイル
st.markdown("""
    <style>
    .main {
        background-color: #0e1117;
    }
    .stMetric {
        background-color: #1e2130;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #3e4451;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("📱 TikTok Lite 運用戦略シミュレーター v2.1")
st.markdown("1800台体制での招待・回転・収益を最適化するための参謀ツール")

# --- セッション状態の初期化 ---
if 'base_invite_patterns' not in st.session_state:
    st.session_state.base_invite_patterns = [
        {"name": "通常招待キャンペーン", "amount": 2500, "active": True},
        {"name": "特別イベント招待", "amount": 5000, "active": False}
    ]

if 'checkin_rewards' not in st.session_state:
    st.session_state.checkin_rewards = {
        "tier1": {"amount": 1350, "prob": 40},
        "tier2": {"amount": 2700, "prob": 40},
        "tier3": {"amount": 6750, "prob": 20}
    }

if 'video_rewards' not in st.session_state:
    st.session_state.video_rewards = [
        {"name": "通常動画再生", "amount": 1000, "active": True},
        {"name": "ボーナス動画", "amount": 2000, "active": False}
    ]

# --- サイドバー：基本設定 ---
with st.sidebar:
    st.header("⚙️ 基本パラメーター")
    
    with st.expander("👥 端末構成", expanded=True):
        total_devices = st.number_input("総端末数", value=1800, step=10)
        parent_count = st.number_input("親端末数 (固定)", value=300, step=10)
        child_count = total_devices - parent_count
        st.info(f"子端末数: {child_count} 台")

    with st.expander("⏳ サイクル設定", expanded=True):
        parent_rest_days = st.number_input("親の休息日 (中N日)", value=5)
        prep_hours = st.number_input("子の準備時間 (時間)", value=300)
        checkin_days = st.number_input("チェックイン期間 (日)", value=14)
        
        prep_days = prep_hours / 24
        parent_cycle = parent_rest_days + 1
        child_cycle = prep_days + checkin_days

# --- メインロジック計算 ---

# タブ構成
tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 報酬・パターン設定"])

with tab3:
    st.subheader("💰 報酬ソースの個別管理")
    st.info("1回の招待で獲得できる3つの報酬源を個別に設定します。")
    
    col_a, col_b, col_c = st.columns(3)
    
    with col_a:
        st.markdown("### ① 招待種別")
        selected_base = None
        for i, p in enumerate(st.session_state.base_invite_patterns):
            if st.checkbox(f"{p['name']} (¥{p['amount']:,})", value=p['active'], key=f"base_{i}"):
                selected_base = p['amount']
        if not selected_base:
            selected_base = 0
            st.warning("招待種別を選択してください")

    with col_b:
        st.markdown("### ② チェックイン報酬")
        p1 = st.slider("1350円の確率 (%)", 0, 100, st.session_state.checkin_rewards["tier1"]["prob"])
        p2 = st.slider("2700円の確率 (%)", 0, 100 - p1, st.session_state.checkin_rewards["tier2"]["prob"])
        p3 = 100 - p1 - p2
        st.write(f"6750円の確率: {p3}%")
        expected_checkin = (1350 * p1/100) + (2700 * p2/100) + (6750 * p3/100)
        st.write(f"**期待値: ¥{int(expected_checkin):,}**")

    with col_c:
        st.markdown("### ③ 動画再生報酬")
        selected_video = 0
        for i, p in enumerate(st.session_state.video_rewards):
            if st.checkbox(f"{p['name']} (¥{p['amount']:,})", value=p['active'], key=f"video_{i}"):
                selected_video += p['amount']
        st.write(f"**合計: ¥{selected_video:,}**")

    total_expected_reward = selected_base + expected_checkin + selected_video
    st.divider()
    st.metric("1招待あたりの合計報酬 (期待値)", f"¥{int(total_expected_reward):,}")

# --- ダッシュボードの計算 ---
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

with tab1:
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("1日あたりの招待数", f"{actual_daily_invites:.1f} 件")
    with col2:
        monthly_revenue = actual_daily_invites * 30 * total_expected_reward
        st.metric("月間予測収益", f"¥{int(monthly_revenue):,}")
    with col3:
        annual_revenue = monthly_revenue * 12
        st.metric("年間予測収益", f"¥{int(annual_revenue):,}")
    with col4:
        bottleneck = "親端末" if daily_parent_cap < daily_child_cap else "子端末"
        st.metric("ボトルネック", bottleneck)

    # 報酬の内訳グラフ
    st.subheader("📊 報酬ソースの内訳")
    reward_breakdown = pd.DataFrame({
        "ソース": ["招待種別", "チェックイン報酬", "動画再生報酬"],
        "金額": [selected_base, expected_checkin, selected_video]
    })
    fig_pie = px.pie(reward_breakdown, values='金額', names='ソース', hole=0.4, 
                     color_discrete_sequence=px.colors.sequential.RdBu)
    fig_pie.update_layout(template="plotly_dark")
    st.plotly_chart(fig_pie, use_container_width=True)

    # 収益推移グラフ
    st.subheader("📈 収益推移シミュレーション")
    sim_days = st.slider("シミュレーション期間 (日)", 30, 365, 90)
    dates = pd.date_range(start="2024-01-01", periods=sim_days)
    daily_rev = actual_daily_invites * total_expected_reward
    cum_rev = np.cumsum([daily_rev] * sim_days)
    df_sim = pd.DataFrame({"日付": dates, "累積収益": cum_rev})
    fig_line = px.line(df_sim, x="日付", y="累積収益", title="累積収益の予測推移")
    fig_line.update_layout(template="plotly_dark")
    st.plotly_chart(fig_line, use_container_width=True)

with tab2:
    st.subheader("🔄 サイクル詳細分析")
    c1, c2 = st.columns(2)
    with c1:
        st.info("### 親端末のサイクル")
        st.write(f"- 総数: {parent_count} 台")
        st.write(f"- サイクル: {parent_cycle} 日 (稼働1 + 休息{parent_rest_days})")
        st.write(f"- 1日あたりの招待可能枠: **{daily_parent_cap:.1f} 件**")
    with c2:
        st.info("### 子端末のサイクル")
        st.write(f"- 総数: {child_count} 台")
        st.write(f"- サイクル: {child_cycle:.1f} 日 (準備{prep_days:.1f} + チェックイン{checkin_days})")
        st.write(f"- 1日あたりの供給能力: **{daily_child_cap:.1f} 件**")

    st.subheader("📋 稼働スケジュールイメージ (100台あたりの例)")
    schedule_data = []
    for i in range(10):
        schedule_data.append({"端末グループ": f"Group {i+1}", "ステータス": "準備中" if i < 4 else "チェックイン中" if i < 8 else "完了/待機"})
    st.table(pd.DataFrame(schedule_data))

st.sidebar.markdown("---")
st.sidebar.caption("Created by Antigravity Assistant v2.1")
