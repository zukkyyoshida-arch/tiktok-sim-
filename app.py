import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Analytics Pro v5.0",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# YouTube風カスタムスタイル
st.markdown("""
    <style>
    .main { background-color: #0e1117; }
    .stMetric {
        background-color: #1e2130;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #2d3139;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    div[data-testid="stMetricValue"] {
        font-size: 2.2rem !important;
        font-weight: 700 !important;
        color: #ffffff !important;
    }
    .reportview-container .main .block-container {
        padding-top: 2rem;
    }
    </style>
    """, unsafe_allow_html=True)

st.title("🚀 TikTok Lite Analytics Pro v5.0")

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

if 'actual_analysis_result' not in st.session_state:
    st.session_state.actual_analysis_result = None

# --- 解析関数 ---
def fetch_actual_data(filter_mode, lookback_days=None, target_month=None):
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
        
        if filter_mode == "直近N日間":
            start_date = datetime.now() - timedelta(days=lookback_days)
            recent_df = df[df['date'] >= start_date].copy()
        else:
            target_dt = datetime.strptime(target_month, "%Y/%m")
            recent_df = df[(df['date'].dt.year == target_dt.year) & (df['date'].dt.month == target_dt.month)].copy()

        if len(recent_df) == 0: return "データが見つかりませんでした。"
        
        # 1. 概要メトリクス
        total_trials = len(recent_df)
        total_success = recent_df['is_success'].sum()
        overall_rate = np.ceil((total_success / total_trials) * 100 * 1000) / 1000
        
        # 2. 日次推移 (YouTubeグラフ用)
        daily_trend = recent_df.groupby(recent_df['date'].dt.date).agg(
            試行数=('is_success', 'count'),
            成功数=('is_success', 'sum')
        ).reset_index()
        daily_trend['成功率'] = (daily_trend['成功数'] / daily_trend['試行数']) * 100
        
        # 3. キャンペーン別ランキング
        summary = recent_df.groupby(q_col).agg(
            試行数=('is_success','count'), 
            成功数=('is_success','sum'), 
            成功率=('is_success','mean')
        ).reset_index()
        summary['成功率'] = np.ceil(summary['成功率'] * 100 * 1000) / 1000
        summary['運用比率'] = np.ceil((summary['試行数'] / total_trials) * 100 * 1000) / 1000
        
        st.session_state.actual_analysis_result = {
            "summary": summary,
            "daily_trend": daily_trend,
            "overall_rate": overall_rate,
            "total_trials": total_trials,
            "total_success": total_success,
            "period": f"{recent_df['date'].min().strftime('%m/%d')} - {recent_df['date'].max().strftime('%m/%d')}"
        }
        return None
    except Exception as e: return f"解析エラー: {e}"

def normalize_ratios(df, col_name):
    total = df[col_name].sum()
    if total == 0: df[col_name] = 100.0 / len(df)
    else: df[col_name] = (df[col_name] / total) * 100.0
    return df

# --- サイドバー設定 ---
with st.sidebar:
    st.header("🛠 シミュレーション設定")
    total_devices = st.number_input("総端末数", value=1800)
    parent_count = st.number_input("親端末数", value=300)
    child_count = total_devices - parent_count
    
    with st.expander("⏳ サイクル"):
        p_cycle = st.number_input("親休息日", value=5) + 1
        c_prep = st.number_input("子準備(h)", value=300) / 24
        c_checkin = 14

    with st.expander("🎯 成功率・キープ戦略", expanded=True):
        default_s = 80.0
        if st.session_state.actual_analysis_result:
            default_s = st.session_state.actual_analysis_result['overall_rate']
        sim_success = st.slider("想定成功率 (%)", 0.0, 100.0, default_s) / 100
        keep_s = st.slider("成功キープ (%)", 0, 100, 100) / 100
        keep_f = st.slider("失敗キープ (%)", 0, 100, 30) / 100

# --- ロジック ---
ratio_keep = (sim_success * keep_s) + ((1-sim_success) * keep_f)
avg_c_cycle = ((c_prep + c_checkin) * ratio_keep) + ((c_prep + 1) * (1-ratio_keep))
daily_invites = min(parent_count/p_cycle, child_count/avg_c_cycle)

# --- メイン UI (タブ) ---
tab_analytics, tab_sim, tab_reward, tab_dash = st.tabs(["📊 実績分析 (Youtube Style)", "🔄 稼働シミュレーション", "💰 報酬・種別管理", "🏠 ダッシュボード"])

with tab_analytics:
    st.subheader("YouTube Analytics 風・実績インサイト")
    
    # 期間セレクター (YouTubeのように右上に配置したいが、Streamlitでは上部カラム)
    c_p1, c_p2, c_p3 = st.columns([2, 2, 1])
    with c_p1:
        f_mode = st.radio("表示期間", ["直近N日間", "月指定"], horizontal=True)
    with c_p2:
        if f_mode == "直近N日間":
            l_days = st.number_input("遡る日数", value=28, min_value=1) # YouTube標準の28日
            t_month = None
        else:
            now = datetime.now()
            months = [(now - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)]
            t_month = st.selectbox("月を選択", months)
            l_days = None
    with c_p3:
        st.write("") # スペース
        st.write("") 
        btn_sync = st.button("🔄 データを同期", use_container_width=True)

    if btn_sync:
        with st.spinner("スプレッドシートからデータを抽出中..."):
            err = fetch_actual_data(f_mode, lookback_days=l_days, target_month=t_month)
            if err: st.error(err)
            else: st.success("同期完了！")

    if st.session_state.actual_analysis_result:
        res = st.session_state.actual_analysis_result
        
        # 1. YouTube風 概要カード
        st.markdown(f"#### 概要 ({res['period']})")
        m1, m2, m3 = st.columns(3)
        m1.metric("総試行数", f"{res['total_trials']:,}")
        m2.metric("成功数", f"{res['total_success']:,}")
        m3.metric("平均成功率", f"{res['overall_rate']:.3f}%")
        
        # 2. YouTube風 推移グラフ
        st.markdown("---")
        st.markdown("#### 勢い（日次推移）")
        fig_trend = px.area(res['daily_trend'], x='date', y='試行数', 
                            title='日別の招待試行数', color_discrete_sequence=['#ff4b4b'])
        fig_trend.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig_trend, use_container_width=True)
        
        # 3. YouTube風 ランキングテーブル
        st.markdown("---")
        st.markdown("#### キャンペーン別のパフォーマンス")
        s = res['summary'].sort_values('成功率', ascending=False)
        display_df = s.copy()
        display_df['成功率'] = display_df['成功率'].map('{:.3f}%'.format)
        display_df['運用比率'] = display_df['運用比率'].map('{:.3f}%'.format)
        st.dataframe(display_df, use_container_width=True, hide_index=True)
    else:
        st.info("「データを同期」ボタンを押すと、スプレッドシートからYouTubeアナリティクス風のレポートを生成します。")

with tab_reward:
    st.subheader("💼 報酬・種別設定")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    if st.button("招待種別の比率を100%に補正"):
        st.session_state.invite_types_df = normalize_ratios(st.session_state.invite_types_df, "運用比率(%)")
        st.rerun()
    
    st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    
    st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, num_rows="dynamic", use_container_width=True)
    if st.button("チェックイン確率を100%に補正"):
        st.session_state.checkin_rewards_df = normalize_ratios(st.session_state.checkin_rewards_df, "出現確率(%)")
        st.rerun()

# --- 他のタブのプレースホルダ (機能は維持) ---
with tab_dash:
    st.subheader("🏠 全体ダッシュボード")
    st.metric("1日あたりの予測招待数", f"{daily_invites:.1f} 件")
    # (既存のスポット計算等をここに配置)

with tab_sim:
    st.subheader("🔄 稼働シミュレーション")
    st.write(f"平均子端末サイクル: {avg_c_cycle:.2f} 日")
    # (既存の4パターン分析をここに配置)

st.sidebar.markdown("---")
st.sidebar.caption("TikTok Lite Analytics Pro v5.0")
