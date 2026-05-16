import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v2.3",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v2.3")
st.markdown("1800台体制での招待・回転・収益を最適化するための参謀ツール")

# --- セッション状態の初期化 ---
if 'invite_types' not in st.session_state:
    st.session_state.invite_types = [
        {"name": "ブタ5000", "immediate": 5000, "task": 0, "ratio": 100},
        {"name": "ブタ2500", "immediate": 2500, "task": 2500, "ratio": 0},
        {"name": "QRコード招待", "immediate": 3000, "task": 0, "ratio": 0},
        {"name": "通常招待", "immediate": 0, "task": 5500, "ratio": 0},
        {"name": "ヒットチャレンジ", "immediate": 5500, "task": 0, "ratio": 0},
        {"name": "即招待", "immediate": 2800, "task": 0, "ratio": 0}
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

# --- ロジック計算 ---

# 子端末の平均サイクル計算
full_cycle = prep_days + checkin_days
full_ratio = success_rate + (1 - success_rate) * high_reward_on_fail
reset_cycle = prep_days + 1
reset_ratio = (1 - success_rate) * (1 - high_reward_on_fail)
avg_child_cycle = (full_cycle * full_ratio) + (reset_cycle * reset_ratio)

# 1日あたりのキャパシティ
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / avg_child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# タブ構成
tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 招待種別・報酬設定"])

with tab3:
    st.subheader("💼 招待種別ポートフォリオ")
    st.write("運用する招待種別の配分を設定してください（合計100%に調整）。")
    
    updated_types = []
    total_ratio = 0
    cols = st.columns(len(st.session_state.invite_types))
    
    for i, itype in enumerate(st.session_state.invite_types):
        with st.expander(f"{itype['name']}", expanded=True):
            ratio = st.number_input(f"配分 (%)", min_value=0, max_value=100, value=itype['ratio'], key=f"ratio_{i}")
            imm = st.number_input(f"即時報酬", value=itype['immediate'], key=f"imm_{i}")
            task = st.number_input(f"完走報酬", value=itype['task'], key=f"task_{i}")
            updated_types.append({"name": itype['name'], "immediate": imm, "task": task, "ratio": ratio})
            total_ratio += ratio

    if total_ratio != 100:
        st.error(f"配分の合計を100%にしてください（現在: {total_ratio}%）")
    
    st.session_state.invite_types = updated_types

    # 加重平均の算出
    w_immediate = sum(t['immediate'] * t['ratio'] / 100 for t in updated_types)
    w_task = sum(t['task'] * t['ratio'] / 100 for t in updated_types)

    st.divider()
    st.subheader("💰 追加報酬設定")
    c_b, c_v = st.columns(2)
    with c_b:
        st.markdown("### チェックイン追加報酬")
        p1 = st.slider("1350円の確率 (%)", 0, 100, st.session_state.checkin_rewards["tier1"]["prob"])
        p2 = st.slider("2700円の確率 (%)", 0, 100 - p1, st.session_state.checkin_rewards["tier2"]["prob"])
        p3 = 100 - p1 - p2
        st.write(f"6750円の確率: {p3}%")
        expected_checkin = (1350 * p1/100) + (2700 * p2/100) + (6750 * p3/100)
        st.write(f"**期待値: ¥{int(expected_checkin):,}**")

    with c_v:
        st.markdown("### 動画再生追加報酬")
        selected_video = 0
        for i, p in enumerate(st.session_state.video_rewards):
            if st.checkbox(f"{p['name']} (¥{p['amount']:,})", value=p['active'], key=f"video_{i}"):
                selected_video += p['amount']
        st.write(f"**合計: ¥{selected_video:,}**")

    # 最終的な1招待あたりの期待収益
    # 即時報酬は成功時のみ、後続報酬(Task + Checkin + Video)は成功およびキープ端末から
    per_invite_revenue = (w_immediate * success_rate) + ((w_task + expected_checkin + selected_video) * full_ratio)

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

    st.subheader("📊 収益の内訳")
    reward_breakdown = pd.DataFrame({
        "ソース": ["即時報酬 (成功分)", "完走・追加報酬 (キープ分)"],
        "金額": [w_immediate * success_rate, (w_task + expected_checkin + selected_video) * full_ratio]
    })
    fig_pie = px.pie(reward_breakdown, values='金額', names='ソース', hole=0.4)
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

st.sidebar.markdown("---")
st.sidebar.caption("Created by Antigravity Assistant v2.3")
