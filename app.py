import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v3.0",
    page_icon="📊",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v3.0")

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

if 'actual_full_data' not in st.session_state:
    st.session_state.actual_full_data = None
if 'actual_summary' not in st.session_state:
    st.session_state.actual_summary = None

# --- スプレッドシート解析 ---
def fetch_actual_data():
    sheet_id = "1R0PmlqcwTwQLuv_sDJ7UiMkpLBbBDdLzhV-hSUJllUQ"
    gid = "937207441"
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    
    try:
        df = pd.read_csv(url, header=4)
        f_col = df.columns[5]   # F列: 状態
        l_col = df.columns[11]  # L列: Tik開始
        q_col = df.columns[16]  # Q列: 招待種別
        
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
        
        if len(recent_df) == 0: return "直近1ヶ月のデータがありません。"
        
        # 種別ごとの集計
        summary = recent_df.groupby(q_col).agg(
            試行数=('is_success', 'count'),
            成功数=('is_success', 'sum'),
            成功率=('is_success', 'mean')
        ).reset_index()
        summary['成功率'] = summary['成功率'] * 100
        summary['運用比率'] = (summary['試行数'] / summary['試行数'].sum()) * 100
        
        st.session_state.actual_full_data = recent_df
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
    
    with st.expander("🎯 シミュレーション成功率", expanded=True):
        default_s = 80.0
        if 'overall_success_rate' in st.session_state:
            default_s = float(st.session_state.overall_success_rate * 100)
        sim_success_rate = st.slider("想定成功率 (%)", 0.0, 100.0, default_s) / 100

# --- ロジック ---
# (サイクル計算等の基本ロジックは維持)
prep_days = 12.5; parent_cycle = 6
keep_rate_success = 1.0; keep_rate_fail = 0.3
ratio_keep = (sim_success_rate * keep_rate_success) + ((1-sim_success_rate) * keep_rate_fail)
avg_child_cycle = (26.5 * ratio_keep) + (13.5 * (1-ratio_keep))
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / avg_child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# --- タブ構成 ---
tab1, tab2, tab3, tab4 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 報酬・種別設定", "📈 実績分析"])

with tab4:
    st.subheader("🔍 スプレッドシート実績分析 (Tik管理_)")
    if st.button("🔄 最新データを取得・分析"):
        with st.spinner("同期中..."):
            err = fetch_actual_data()
            if err: st.error(err)
            else: st.success("分析完了！")
    
    if st.session_state.actual_summary is not None:
        s = st.session_state.actual_summary
        col1, col2, col3 = st.columns(3)
        with col1: st.metric("全体成功率", f"{st.session_state.overall_success_rate*100:.1f}%")
        with col2: st.metric("直近1ヶ月試行数", f"{int(s['試行数'].sum())}件")
        with col3: st.metric("有効種別数", f"{len(s)}件")
        
        st.divider()
        c1, c2 = st.columns(2)
        with c1:
            st.markdown("### 🏆 種別ごとの成功率")
            fig_bar = px.bar(s, x='成功率', y=s.columns[0], orientation='h', 
                             text_auto='.1f', color='成功率', color_continuous_scale='RdYlGn')
            st.plotly_chart(fig_bar, use_container_width=True)
        with c2:
            st.markdown("### 📊 実際の運用ポートフォリオ")
            fig_pie = px.pie(s, values='試行数', names=s.columns[0], hole=0.4)
            st.plotly_chart(fig_pie, use_container_width=True)
            
        st.markdown("### 📋 詳細データテーブル")
        st.dataframe(s.sort_values('成功率', ascending=False), use_container_width=True)
    else:
        st.info("上のボタンを押してスプレッドシートからデータを取得してください。")

with tab1:
    st.subheader("📍 本日のスポット")
    # (スポット計算ロジック)
    per_invite_rev = 8000 # 概算
    st.write(f"1日平均招待数: {actual_daily_invites:.1f} 件")
    st.write(f"月間予測収益: ¥{int(actual_daily_invites * 30 * per_invite_rev):,}")

with tab3:
    st.subheader("💼 招待種別の管理")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)

st.sidebar.markdown("---")
st.sidebar.caption("TikTok Lite Strategy Simulator v3.0")
