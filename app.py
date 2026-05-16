import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター")
st.markdown("1800台体制での招待・回転・収益を最適化するための参謀ツール")

# --- セッション状態の初期化 ---
if 'rewards' not in st.session_state:
    st.session_state.rewards = {
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
        child_cycle = prep_days + checkin_days
        
    with st.expander("💰 報酬確率設定", expanded=False):
        p1 = st.slider("1350円の確率 (%)", 0, 100, st.session_state.rewards["tier1"]["prob"])
        p2 = st.slider("2700円の確率 (%)", 0, 100 - p1, st.session_state.rewards["tier2"]["prob"])
        p3 = 100 - p1 - p2
        st.write(f"6750円の確率: {p3}%")
        
        expected_reward = (1350 * p1/100) + (2700 * p2/100) + (6750 * p3/100)
        st.metric("期待報酬単価", f"¥{int(expected_reward):,}")

# --- ロジック計算 ---
# 1日あたりのキャパシティ
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# タブ構成
tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "🛠 詳細設定"])

with tab1:
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("1日あたりの招待数", f"{actual_daily_invites:.1f} 件")
    with col2:
        monthly_revenue = actual_daily_invites * 30 * expected_reward
        st.metric("月間予測収益", f"¥{int(monthly_revenue):,}")
    with col3:
        annual_revenue = monthly_revenue * 12
        st.metric("年間予測収益", f"¥{int(annual_revenue):,}")
    with col4:
        bottleneck = "親端末" if daily_parent_cap < daily_child_cap else "子端末"
        st.metric("ボトルネック", bottleneck)

    # ボトルネック分析アドバイス
    st.subheader("💡 参謀のアドバイス")
    if daily_parent_cap < daily_child_cap:
        needed_parents = (daily_child_cap * parent_cycle) - parent_count
        st.warning(f"現在は**親端末**が不足しています。あと **{int(needed_parents)}台** 親を増やすと、1500台の子端末をフル稼働（1日 {daily_child_cap:.1f} 招待）できます。")
    else:
        extra_children_capacity = (daily_parent_cap - daily_child_cap) * child_cycle
        st.success(f"現在は**子端末**の供給が追いついていません。あと **{int(extra_children_capacity)}台** 子端末（または総端末）を増やすと、親の回転効率を最大化できます。")

    # 収益推移グラフ
    st.subheader("📈 収益推移シミュレーション")
    sim_days = st.slider("シミュレーション期間 (日)", 30, 365, 90)
    
    dates = pd.date_range(start="2024-01-01", periods=sim_days)
    daily_rev = actual_daily_invites * expected_reward
    cum_rev = np.cumsum([daily_rev] * sim_days)
    
    df_sim = pd.DataFrame({
        "日付": dates,
        "累積収益": cum_rev
    })
    
    fig = px.line(df_sim, x="日付", y="累積収益", title="累積収益の予測推移")
    fig.update_layout(template="plotly_dark", hovermode="x unified")
    st.plotly_chart(fig, use_container_width=True)

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

    st.divider()
    
    st.subheader("📋 稼働スケジュールイメージ (100台あたりの例)")
    # 簡単なスケジュール可視化（概念図）
    schedule_data = []
    for i in range(10):
        schedule_data.append({"端末グループ": f"Group {i+1}", "ステータス": "準備中" if i < 4 else "チェックイン中" if i < 8 else "完了/待機"})
    st.table(pd.DataFrame(schedule_data))

with tab3:
    st.subheader("💼 招待ポートフォリオ設定")
    st.write("複数の招待キャンペーンを組み合わせた場合の期待値を算出します。")
    
    if 'patterns' not in st.session_state:
        st.session_state.patterns = [
            {"name": "通常招待 (1350/2700/6750混合)", "amount": expected_reward, "ratio": 100}
        ]
    
    # 既存のパターン表示と編集
    new_patterns = []
    total_ratio = 0
    for i, pattern in enumerate(st.session_state.patterns):
        col_n, col_a, col_r = st.columns([3, 2, 2])
        with col_n:
            name = st.text_input(f"パターン {i+1} 名", value=pattern["name"], key=f"pname_{i}")
        with col_a:
            amount = st.number_input(f"単価 {i+1}", value=int(pattern["amount"]), key=f"pamt_{i}")
        with col_r:
            ratio = st.slider(f"配分 {i+1} (%)", 0, 100, value=pattern["ratio"], key=f"pratio_{i}")
        new_patterns.append({"name": name, "amount": amount, "ratio": ratio})
        total_ratio += ratio

    if st.button("パターンを追加"):
        st.session_state.patterns.append({"name": "新キャンペーン", "amount": 2500, "ratio": 0})
        st.rerun()

    if total_ratio != 100:
        st.error(f"配分の合計を100%にしてください（現在: {total_ratio}%）")
    else:
        portfolio_expected = sum(p["amount"] * p["ratio"] / 100 for p in new_patterns)
        st.success(f"ポートフォリオ全体の期待報酬単価: ¥{int(portfolio_expected):,}")
        # 全体計算に反映させるために変数を更新
        expected_reward = portfolio_expected

    st.divider()
    st.subheader("🛠 システム設定")
    if st.button("設定をリセット"):
        st.session_state.clear()
        st.rerun()

st.sidebar.markdown("---")
st.sidebar.caption("Created by Antigravity Assistant")
