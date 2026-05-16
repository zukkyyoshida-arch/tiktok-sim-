import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v3.2",
    page_icon="📱",
    layout="wide",
    initial_sidebar_state="expanded"
)

# スタイル
st.markdown("""
    <style>
    .main { background-color: #0e1117; }
    .stMetric {
        background-color: #1e2130;
        padding: 15px;
        border-radius: 10px;
        border: 1px solid #3e4451;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("📱 TikTok Lite 運用戦略シミュレーター v3.2")

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
    st.session_state.checkin_rewards = {"tier1_prob": 40, "tier2_prob": 40}

if 'actual_summary' not in st.session_state:
    st.session_state.actual_summary = None

# --- 解析関数 ---
def fetch_actual_data():
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
        one_month_ago = datetime.now() - timedelta(days=30)
        recent_df = df[df['date'] >= one_month_ago].copy()
        if len(recent_df) == 0: return "直近1ヶ月のデータが見つかりませんでした。"
        summary = recent_df.groupby(q_col).agg(試行数=('is_success','count'), 成功数=('is_success','sum'), 成功率=('is_success','mean')).reset_index()
        summary['成功率'] *= 100
        summary['運用比率'] = (summary['試行数'] / summary['試行数'].sum()) * 100
        st.session_state.actual_summary = summary
        st.session_state.overall_success_rate = recent_df['is_success'].mean()
        return None
    except Exception as e: return f"解析エラー: {e}"

# --- サイドバー ---
with st.sidebar:
    st.header("⚙️ 設定")
    with st.expander("👥 端末構成", expanded=True):
        total_devices = st.number_input("総端末数", value=1800, step=10)
        parent_count = st.number_input("親端末数 (固定)", value=300, step=10)
        child_count = total_devices - parent_count

    with st.expander("⏳ サイクル設定", expanded=False):
        parent_rest_days = st.number_input("親の休息日 (中N日)", value=5)
        prep_hours = st.number_input("子の準備時間 (時間)", value=300)
        checkin_days = st.number_input("チェックイン期間 (日)", value=14)
        prep_days = prep_hours / 24
        parent_cycle = parent_rest_days + 1

    with st.expander("🎯 歩留まり戦略", expanded=True):
        default_s = 80.0
        if 'overall_success_rate' in st.session_state:
            default_s = float(st.session_state.overall_success_rate * 100)
        success_rate = st.slider("招待成功率 (%)", 0.0, 100.0, default_s) / 100
        keep_rate_success = st.slider("成功キープ率 (%)", 0, 100, 100) / 100
        keep_rate_fail = st.slider("失敗キープ率 (%)", 0, 100, 30) / 100

# --- ロジック ---
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

# --- タブ ---
tab1, tab2, tab3, tab4 = st.tabs(["📊 ダッシュボード", "🔄 稼働分析", "💰 報酬・種別管理", "📈 実績分析"])

with tab3:
    st.subheader("💼 招待種別の管理")
    # 招待種別の編集
    edited_invite_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    st.session_state.invite_types_df = edited_invite_df
    
    # 計算用にNaNを埋める
    calc_invite_df = edited_invite_df.copy()
    calc_invite_df["運用比率(%)"] = calc_invite_df["運用比率(%)"].fillna(0)
    calc_invite_df["即時報酬"] = calc_invite_df["即時報酬"].fillna(0)
    calc_invite_df["完走報酬"] = calc_invite_df["完走報酬"].fillna(0)
    
    w_immediate = sum(calc_invite_df["即時報酬"] * calc_invite_df["運用比率(%)"] / 100)
    w_task = sum(calc_invite_df["完走報酬"] * calc_invite_df["運用比率(%)"] / 100)

    st.divider()
    st.subheader("📺 動画再生報酬の管理")
    # 動画報酬の編集
    edited_video_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    st.session_state.video_rewards_df = edited_video_df
    
    # 計算用にNaNを埋めて型を強制
    calc_video_df = edited_video_df.copy()
    if "有効" in calc_video_df.columns:
        calc_video_df["有効"] = calc_video_df["有効"].fillna(False).astype(bool)
        calc_video_df["報酬額"] = calc_video_df["報酬額"].fillna(0)
        final_video = calc_video_df[calc_video_df["有効"]]["報酬額"].sum()
    else:
        final_video = 0

    st.divider()
    st.subheader("🎁 チェックイン追加報酬")
    p1 = st.slider("1350円の確率", 0, 100, st.session_state.checkin_rewards["tier1_prob"])
    p2 = st.slider("2700円の確率", 0, 100-p1, st.session_state.checkin_rewards["tier2_prob"])
    expected_checkin = (1350 * p1/100) + (2700 * p2/100) + (6750 * (100-p1-p2)/100)

    rev_immediate = w_immediate * success_rate
    rev_additional = (w_task + expected_checkin + final_video) * (ratio_s_keep + ratio_f_keep)
    per_invite_revenue = rev_immediate + rev_additional

with tab1:
    st.subheader("📍 本日のスポット")
    cs1, cs2, cs3 = st.columns(3)
    with cs1: t_child = st.number_input("本日招待可能な子端末", value=50)
    with cs2: t_parent = st.number_input("本日稼働可能な親端末", value=int(daily_parent_cap))
    with cs3:
        t_invites = min(t_child, t_parent)
        st.metric("見込み収益", f"¥{int(t_invites * per_invite_revenue):,}")
    
    st.divider()
    st.subheader("📈 長期予測（サイクル計算）")
    col1, col2, col3, col4 = st.columns(4)
    with col1: st.metric("1日あたり招待数", f"{actual_daily_invites:.1f} 件")
    with col2: st.metric("月間予測収益", f"¥{int(actual_daily_invites * 30 * per_invite_revenue):,}")
    with col3: st.metric("年間予測収益", f"¥{int(actual_daily_invites * 365 * per_invite_revenue):,}")
    with col4: st.metric("ボトルネック", "親端末" if daily_parent_cap < daily_child_cap else "子端末")

    st.subheader("💰 収益の内訳")
    rb = pd.DataFrame({"ソース": ["即時報酬", "完走・追加報酬"], "金額": [rev_immediate, rev_additional]})
    st.plotly_chart(px.pie(rb, values='金額', names='ソース', hole=0.4), use_container_width=True)

with tab4:
    st.subheader("📈 実績分析")
    if st.button("🔄 データを同期"):
        with st.spinner("同期中..."):
            err = fetch_actual_data(); 
            if err: st.error(err)
            else: st.success("同期完了！")
    if st.session_state.actual_summary is not None:
        s = st.session_state.actual_summary
        st.metric("実績Success率", f"{st.session_state.overall_success_rate*100:.1f}%")
        st.plotly_chart(px.bar(s, x='成功率', y=s.columns[0], orientation='h', color='成功率'), use_container_width=True)
        st.dataframe(s, use_container_width=True)

with tab2:
    st.subheader("🔄 回転戦略の詳細")
    st.write(f"平均子端末サイクル: **{avg_child_cycle:.2f} 日**")
    c1, c2, c3, c4 = st.columns(4)
    with c1: st.success(f"成功・キープ\n{ratio_s_keep*100:.1f}%\n{cycle_full:.1f}日")
    with c2: st.info(f"成功・リセット\n{ratio_s_reset*100:.1f}%\n{cycle_reset:.1f}日")
    with c3: st.warning(f"失敗・キープ\n{ratio_f_keep*100:.1f}%\n{cycle_full:.1f}日")
    with c4: st.error(f"失敗・リセット\n{ratio_f_reset*100:.1f}%\n{cycle_reset:.1f}日")

st.sidebar.markdown("---")
st.sidebar.caption("TikTok Lite Strategy Simulator v3.2")
