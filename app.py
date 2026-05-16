import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v2.5",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v2.5")

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
        st.caption("※キープしない端末は1日で即リセットし、次の準備に入ります")

# --- ロジック計算 ---

# 4つのグループの比率とサイクル
# 1. 成功 + キープ
ratio_s_keep = success_rate * keep_rate_success
# 2. 成功 + 即リセット
ratio_s_reset = success_rate * (1 - keep_rate_success)
# 3. 失敗 + キープ
ratio_f_keep = (1 - success_rate) * keep_rate_fail
# 4. 失敗 + 即リセット
ratio_f_reset = (1 - success_rate) * (1 - keep_rate_fail)

# サイクル
cycle_full = prep_days + checkin_days
cycle_reset = prep_days + 1

# 平均サイクル
avg_child_cycle = (cycle_full * (ratio_s_keep + ratio_f_keep)) + (cycle_reset * (ratio_s_reset + ratio_f_reset))

# 1日あたりのキャパシティ
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / avg_child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# --- タブ構成 ---
tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 報酬・種別管理"])

with tab3:
    st.subheader("💼 招待種別の管理")
    edited_df = st.data_editor(
        st.session_state.invite_types_df,
        num_rows="dynamic",
        column_config={
            "運用比率(%)": st.column_config.NumberColumn(min_value=0, max_value=100, format="%d%%"),
            "即時報酬": st.column_config.NumberColumn(format="¥%d"),
            "完走報酬": st.column_config.NumberColumn(format="¥%d"),
        },
        use_container_width=True,
        key="invite_editor"
    )
    
    total_ratio = edited_df["運用比率(%)"].sum()
    if total_ratio != 100:
        st.error(f"「運用比率(%)」の合計を100%にしてください（現在: {total_ratio}%）")
    else:
        st.session_state.invite_types_df = edited_df

    w_immediate = sum(edited_df["即時報酬"] * edited_df["運用比率(%)"] / 100)
    w_task = sum(edited_df["完走報酬"] * edited_df["運用比率(%)"] / 100)

    st.divider()
    col_b, col_v = st.columns(2)
    with col_b:
        st.markdown("### 🎁 チェックイン追加報酬")
        p1 = st.slider("1350円の確率 (%)", 0, 100, st.session_state.checkin_rewards["tier1"]["prob"])
        p2 = st.slider("2700円の確率 (%)", 0, 100 - p1, st.session_state.checkin_rewards["tier2"]["prob"])
        p3 = 100 - p1 - p2
        expected_checkin = (1350 * p1/100) + (2700 * p2/100) + (6750 * p3/100)
        st.write(f"期待値: ¥{int(expected_checkin):,}")

    with col_v:
        st.markdown("### 📺 動画再生追加報酬")
        video_amount = st.number_input("動画再生報酬 (¥)", value=1000, step=100)
        video_active = st.toggle("動画再生報酬を有効にする", value=True)
        final_video = video_amount if video_active else 0

    # 収益内訳計算
    # 即時報酬はすべての成功(Group 1a, 1b)で発生
    rev_immediate = w_immediate * success_rate
    # 完走報酬・チェックイン・動画はキープ端末(Group 1a, 2)で発生
    rev_additional = (w_task + expected_checkin + final_video) * (ratio_s_keep + ratio_f_keep)
    per_invite_revenue = rev_immediate + rev_additional

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

    # 具体的な金額内訳の表示
    st.subheader("💰 1招待あたりの収益内訳（平均）")
    detail_df = pd.DataFrame([
        {"項目": "即時報酬 (成功分)", "金額": f"¥{int(rev_immediate):,}"},
        {"項目": "完走・追加報酬 (キープ分)", "金額": f"¥{int(rev_additional):,}"},
        {"項目": "合計期待収益", "金額": f"¥{int(per_invite_revenue):,}"}
    ])
    st.table(detail_df)

    # 収益推移グラフ
    st.subheader("📈 収益推移シミュレーション")
    sim_days = st.slider("シミュレーション期間 (日)", 1, 365, 30)
    dates = pd.date_range(start="2024-01-01", periods=sim_days)
    daily_rev = actual_daily_invites * per_invite_revenue
    cum_rev = np.cumsum([daily_rev] * sim_days)
    df_sim = pd.DataFrame({"日付": dates, "累積収益": cum_rev})
    fig_line = px.line(df_sim, x="日付", y="累積収益", title=f"{sim_days}日間の累積収益予測")
    fig_line.update_layout(template="plotly_dark")
    st.plotly_chart(fig_line, use_container_width=True)
    
    st.info(f"期間中の総収益予測: ¥{int(cum_rev[-1]):,}")

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
st.sidebar.caption("Created by Antigravity Assistant v2.5")
