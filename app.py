import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v2.7",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v2.7")

# --- セッション状態の初期化 ---
if 'invite_types_df' not in st.session_state:
    st.session_state.invite_types_df = pd.DataFrame([
        {"キャンペーン名": "ブタ5000", "即時報酬": 5000, "完走報酬": 0, "運用比率(%)": 100},
        {"キャンペーン名": "ブタ2500", "即時報酬": 2500, "完走報酬": 2500, "運用比率(%)": 0},
        {"キャンペーン名": "QRコード招待", "即時報酬": 3000, "完走報酬": 0, "運用比率(%)": 0},
        {"キャンペーン名": "通常招待", "即時報酬": 0, "完走報酬": 5500, "運用比率(%)": 0},
        {"キャンペーン名": "ヒットチャレンジ", "即時報酬": 5500, "完走報酬": 0, "運用比率(%)": 0},
        {"キャンペーン名": "即招待", "即時報酬": 2800, "完走報酬": 0, "運用比率(%)": 0}
    ])

if 'video_rewards_df' not in st.session_state:
    st.session_state.video_rewards_df = pd.DataFrame([
        {"動画パターン名": "通常再生報酬", "報酬額": 1000, "有効": True},
        {"動画パターン名": "特別ボーナス", "報酬額": 1500, "有効": False}
    ])

if 'checkin_rewards' not in st.session_state:
    st.session_state.checkin_rewards = {
        "tier1": {"amount": 1350, "prob": 40},
        "tier2": {"amount": 2700, "prob": 40},
        "tier3": {"amount": 6750, "prob": 20}
    }

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

    with st.expander("🎯 成功・歩留まり戦略", expanded=True):
        success_rate = st.slider("招待成功率 (%)", 0, 100, 80) / 100
        keep_rate_success = st.slider("成功時の高報酬(キープ)率 (%)", 0, 100, 100) / 100
        keep_rate_fail = st.slider("失敗時の高報酬(キープ)率 (%)", 0, 100, 30) / 100

# --- ロジック計算 ---
ratio_s_keep = success_rate * keep_rate_success
ratio_s_reset = success_rate * (1 - keep_rate_success)
ratio_f_keep = (1 - success_rate) * keep_rate_fail
ratio_f_reset = (1 - success_rate) * (1 - keep_rate_fail)

cycle_full = prep_days + checkin_days
cycle_reset = prep_days + 1
avg_child_cycle = (cycle_full * (ratio_s_keep + ratio_f_keep)) + (cycle_reset * (ratio_s_reset + ratio_f_reset))

daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / avg_child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# --- タブ構成 ---
tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 報酬・種別管理"])

with tab3:
    st.subheader("💼 招待種別の管理")
    edited_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    st.session_state.invite_types_df = edited_df

    w_immediate = sum(edited_df["即時報酬"] * edited_df["運用比率(%)"] / 100)
    w_task = sum(edited_df["完走報酬"] * edited_df["運用比率(%)"] / 100)

    st.divider()
    
    st.subheader("📺 動画再生報酬の管理")
    edited_video_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    st.session_state.video_rewards_df = edited_video_df
    final_video = edited_video_df[edited_video_df["有効"]]["報酬額"].sum()
    st.write(f"現在の動画報酬合計: **¥{final_video:,}**")

    st.divider()
    
    st.subheader("🎁 チェックイン追加報酬")
    p1 = st.slider("1350円の確率 (%)", 0, 100, st.session_state.checkin_rewards["tier1"]["prob"])
    p2 = st.slider("2700円の確率 (%)", 0, 100 - p1, st.session_state.checkin_rewards["tier2"]["prob"])
    p3 = 100 - p1 - p2
    expected_checkin = (1350 * p1/100) + (2700 * p2/100) + (6750 * p3/100)
    st.write(f"期待値: ¥{int(expected_checkin):,}")

    rev_immediate = w_immediate * success_rate
    rev_additional = (w_task + expected_checkin + final_video) * (ratio_s_keep + ratio_f_keep)
    per_invite_revenue = rev_immediate + rev_additional

with tab1:
    st.subheader("📍 本日のスポット・シミュレーション")
    c_spot1, c_spot2, c_spot3 = st.columns(3)
    with c_spot1:
        today_ready_children = st.number_input("本日招待可能な子端末 (台)", value=50)
    with c_spot2:
        today_ready_parents = st.number_input("本日稼働可能な親端末 (台)", value=int(daily_parent_cap))
    with c_spot3:
        today_invites = min(today_ready_children, today_ready_parents)
        today_profit = today_invites * per_invite_revenue
        st.metric("本日の見込み収益", f"¥{int(today_profit):,}")

    st.divider()

    st.subheader("📈 長期予測（サイクル計算ベース）")
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

    st.subheader("💰 1招待あたりの収益内訳（平均）")
    detail_df = pd.DataFrame([
        {"項目": "即時報酬 (成功分)", "金額": f"¥{int(rev_immediate):,}"},
        {"項目": "完走・追加報酬 (キープ分)", "金額": f"¥{int(rev_additional):,}"},
        {"項目": "合計期待収益", "金額": f"¥{int(per_invite_revenue):,}"}
    ])
    st.table(detail_df)

    st.subheader("📈 収益推移シミュレーション")
    sim_days = st.slider("シミュレーション期間 (日)", 1, 365, 30)
    dates = pd.date_range(start="2024-01-01", periods=sim_days)
    daily_rev = actual_daily_invites * per_invite_revenue
    cum_rev = np.cumsum([daily_rev] * sim_days)
    df_sim = pd.DataFrame({"日付": dates, "累積収益": cum_rev})
    fig_line = px.line(df_sim, x="日付", y="累積収益", title=f"{sim_days}日間の累積収益予測")
    fig_line.update_layout(template="plotly_dark")
    st.plotly_chart(fig_line, use_container_width=True)

with tab2:
    st.subheader("🔄 回転戦略の詳細")
    st.write(f"平均子端末サイクル: **{avg_child_cycle:.2f} 日**")
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.success(f"### 成功・キープ\n{ratio_s_keep*100:.1f}%\n{cycle_full:.1f}日")
    with c2:
        st.info(f"### 成功・リセット\n{ratio_s_reset*100:.1f}%\n{cycle_reset:.1f}日")
    with c3:
        st.warning(f"### 失敗・キープ\n{ratio_f_keep*100:.1f}%\n{cycle_full:.1f}日")
    with c4:
        st.error(f"### 失敗・リセット\n{ratio_f_reset*100:.1f}%\n{cycle_reset:.1f}日")

st.sidebar.markdown("---")
st.sidebar.caption("Created by Antigravity Assistant v2.7")
