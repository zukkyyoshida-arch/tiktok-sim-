import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v2.2",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v2.2")
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

    with st.expander("🎯 成功・歩留まり率", expanded=True):
        success_rate = st.slider("招待成功率 (%)", 0, 100, 80) / 100
        high_reward_on_fail = st.slider("失敗時の高報酬(キープ)率 (%)", 0, 100, 30) / 100
        st.caption("※高報酬端末は失敗しても14日間維持すると仮定")

# --- ロジック計算 ---

# 子端末の平均サイクル計算
# 1. 成功 + 失敗キープ端末 (prep + task)
full_cycle = prep_days + checkin_days
full_ratio = success_rate + (1 - success_rate) * high_reward_on_fail

# 2. 失敗即リセット端末 (prep + 1日)
reset_cycle = prep_days + 1
reset_ratio = (1 - success_rate) * (1 - high_reward_on_fail)

# 平均サイクル (加重平均)
avg_child_cycle = (full_cycle * full_ratio) + (reset_cycle * reset_ratio)

# 1日あたりのキャパシティ
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / avg_child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# タブ構成
tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 報酬・パターン設定"])

with tab3:
    st.subheader("💰 報酬ソースの個別管理")
    col_a, col_b, col_c = st.columns(3)
    
    with col_a:
        st.markdown("### ① 招待種別")
        selected_base = 0
        for i, p in enumerate(st.session_state.base_invite_patterns):
            if st.checkbox(f"{p['name']} (¥{p['amount']:,})", value=p['active'], key=f"base_{i}"):
                selected_base = p['amount']
    
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
    
    # 収益計算（成功時のみもらえるものと、チェックイン等でもらえるものを考慮）
    # ここでは単純化のため、招待成功率を全体の期待値に乗じる
    # 招待種別は成功時のみ、追加報酬（チェックイン/動画）は「キープ」した端末からももらえると仮定
    per_invite_revenue = (selected_base * success_rate) + (expected_checkin * full_ratio) + (selected_video * full_ratio)
    
    st.divider()
    st.metric("1招待(試行)あたりの平均期待収益", f"¥{int(per_invite_revenue):,}")
    st.caption("※招待成功報酬は成功率を乗算、追加報酬はキープ端末分も含む")

with tab1:
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("1日あたりの招待(試行)数", f"{actual_daily_invites:.1f} 件")
    with col2:
        monthly_revenue = actual_daily_invites * 30 * per_invite_revenue
        st.metric("月間予測収益", f"¥{int(monthly_revenue):,}")
    with col3:
        annual_revenue = monthly_revenue * 12
        st.metric("年間予測収益", f"¥{int(annual_revenue):,}")
    with col4:
        bottleneck = "親端末" if daily_parent_cap < daily_child_cap else "子端末"
        st.metric("ボトルネック", bottleneck)

    st.subheader("📊 収益ソースの内訳 (1招待あたり)")
    reward_breakdown = pd.DataFrame({
        "ソース": ["招待種別(成功分)", "チェックイン報酬(キープ分)", "動画再生報酬(キープ分)"],
        "金額": [selected_base * success_rate, expected_checkin * full_ratio, selected_video * full_ratio]
    })
    fig_pie = px.pie(reward_breakdown, values='金額', names='ソース', hole=0.4, color_discrete_sequence=px.colors.sequential.RdBu)
    fig_pie.update_layout(template="plotly_dark")
    st.plotly_chart(fig_pie, use_container_width=True)

    st.subheader("📈 収益推移シミュレーション")
    sim_days = st.slider("シミュレーション期間 (日)", 30, 365, 90)
    dates = pd.date_range(start="2024-01-01", periods=sim_days)
    daily_rev = actual_daily_invites * per_invite_revenue
    cum_rev = np.cumsum([daily_rev] * sim_days)
    df_sim = pd.DataFrame({"日付": dates, "累積収益": cum_rev})
    fig_line = px.line(df_sim, x="日付", y="累積収益", title="累積収益の予測推移")
    fig_line.update_layout(template="plotly_dark")
    st.plotly_chart(fig_line, use_container_width=True)

with tab2:
    st.subheader("🔄 回転戦略の詳細")
    st.write(f"平均子端末サイクル: **{avg_child_cycle:.2f} 日**")
    
    c1, c2, c3 = st.columns(3)
    with c1:
        st.success(f"### 成功端末\n割合: {success_rate*100:.0f}%\nサイクル: {full_cycle:.1f}日")
    with c2:
        st.warning(f"### 失敗(キープ)\n割合: {(1-success_rate)*high_reward_on_fail*100:.0f}%\nサイクル: {full_cycle:.1f}日")
    with c3:
        st.error(f"### 失敗(リセット)\n割合: {reset_ratio*100:.0f}%\nサイクル: {reset_cycle:.1f}日")

    st.divider()
    st.info(f"### 1日あたりの供給能力\n- 親端末枠: {daily_parent_cap:.1f} 件\n- 子端末供給: {daily_child_cap:.1f} 件")

st.sidebar.markdown("---")
st.sidebar.caption("Created by Antigravity Assistant v2.2")
