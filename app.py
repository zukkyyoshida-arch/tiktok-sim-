import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v2.9",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v2.9")

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

if 'actual_stats' not in st.session_state:
    st.session_state.actual_stats = None

# --- 高度なスプレッドシート解析関数 ---
def fetch_actual_data():
    sheet_id = "1R0PmlqcwTwQLuv_sDJ7UiMkpLBbBDdLzhV-hSUJllUQ"
    gid = "937207441"
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    
    try:
        # 5行目がヘッダーなので header=4
        df = pd.read_csv(url, header=4)
        
        # 列名を取得
        f_col = df.columns[5]   # F列: 状態
        l_col = df.columns[11]  # L列: Tik開始
        
        # 特殊な日付形式「5/4(月)」を解析する関数
        def parse_date_with_weekday(date_str):
            if pd.isna(date_str) or not isinstance(date_str, str):
                return pd.NaT
            # 「(月)」などの曜日部分を削除
            clean_date = re.sub(r'\(.*?\)', '', date_str).strip()
            try:
                # 現在の年を補完
                current_year = datetime.now().year
                dt = datetime.strptime(f"{current_year}/{clean_date}", "%Y/%m/%d")
                # もし解析結果が未来すぎる（例：1月なのに12月のデータ）場合は、前年とみなす
                if dt > datetime.now() + timedelta(days=1):
                    dt = dt.replace(year=current_year - 1)
                return dt
            except:
                return pd.NaT

        df['parsed_date'] = df[l_col].apply(parse_date_with_weekday)
        
        # 直近1ヶ月に絞り込み
        one_month_ago = datetime.now() - timedelta(days=30)
        recent_df = df[df['parsed_date'] >= one_month_ago].copy()
        
        if len(recent_df) == 0:
            # デバッグ用：最新のデータの日付を表示
            last_date = df['parsed_date'].max()
            return f"直近1ヶ月のデータが見つかりませんでした。最新の日付: {last_date}"
        
        # 成功率計算
        success_count = recent_df[f_col].astype(str).str.contains("成功").sum()
        total_count = len(recent_df)
        success_rate = success_count / total_count
        
        st.session_state.actual_stats = {
            "success_rate": success_rate,
            "total_count": total_count,
            "success_count": success_count,
            "last_updated": datetime.now().strftime("%H:%M:%S")
        }
        return None
    except Exception as e:
        return f"解析エラー: {e}"

# --- サイドバー：基本設定 ---
with st.sidebar:
    st.header("⚙️ 基本パラメーター")
    
    if st.button("🔄 実績データを同期（Tik管理_）"):
        with st.spinner("スプレッドシートを解析中..."):
            err = fetch_actual_data()
            if err:
                st.error(err)
            else:
                st.success("同期成功！")

    if st.session_state.actual_stats:
        s = st.session_state.actual_stats
        st.info(f"📊 直近実績データ\n- 成功率: {s['success_rate']*100:.1f}%\n- 試行数: {s['total_count']}件\n- 更新: {s['last_updated']}")

    with st.expander("👥 端末構成", expanded=True):
        total_devices = st.number_input("総端末数", value=1800, step=10)
        parent_count = st.number_input("親端末数 (固定)", value=300, step=10)
        child_count = total_devices - parent_count

    with st.expander("🎯 成功・歩留まり戦略", expanded=True):
        default_success = 80.0
        if st.session_state.actual_stats:
            default_success = float(st.session_state.actual_stats['success_rate'] * 100)
        
        success_rate = st.slider("招待成功率 (%)", 0.0, 100.0, default_success) / 100
        keep_rate_success = st.slider("成功時の高報酬(キープ)率 (%)", 0, 100, 100) / 100
        keep_rate_fail = st.slider("失敗時の高報酬(キープ)率 (%)", 0, 100, 30) / 100

# (以下、ロジック計算とUIは前回と同様)
prep_hours = 300 # デフォルト
checkin_days = 14 # デフォルト
prep_days = prep_hours / 24
parent_rest_days = 5 # デフォルト
parent_cycle = parent_rest_days + 1

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

tab1, tab2, tab3 = st.tabs(["📊 ダッシュボード", "🔄 稼働シミュレーション", "💰 報酬・種別管理"])

edited_df = st.session_state.invite_types_df
w_immediate = sum(edited_df["即時報酬"] * edited_df["運用比率(%)"] / 100)
w_task = sum(edited_df["完走報酬"] * edited_df["運用比率(%)"] / 100)
expected_checkin = 2500
final_video = 1000
per_invite_revenue = (w_immediate * success_rate) + ((w_task + expected_checkin + final_video) * (ratio_s_keep + ratio_f_keep))

with tab1:
    st.subheader("📍 本日のスポット・シミュレーション")
    c_spot1, c_spot2, c_spot3 = st.columns(3)
    with c_spot1:
        today_ready_children = st.number_input("本日招待可能な子端末 (台)", value=50)
    with c_spot2:
        today_ready_parents = st.number_input("本日稼働可能な親端末 (台)", value=int(daily_parent_cap))
    with c_spot3:
        today_invites = min(today_ready_children, today_ready_parents)
        st.metric("本日の見込み収益", f"¥{int(today_invites * per_invite_revenue):,}")

    st.divider()
    st.subheader("📈 長期予測")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("1日あたりの招待(試行)数", f"{actual_daily_invites:.1f} 件")
    with col2:
        st.metric("月間予測収益", f"¥{int(actual_daily_invites * 30 * per_invite_revenue):,}")
    with col3:
        st.metric("年間予測収益", f"¥{int(actual_daily_invites * 365 * per_invite_revenue):,}")
    with col4:
        bottleneck = "親端末" if daily_parent_cap < daily_child_cap else "子端末"
        st.metric("ボトルネック", bottleneck)

with tab3:
    st.subheader("💼 招待種別の管理")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)

st.sidebar.markdown("---")
st.sidebar.caption("Created by Antigravity Assistant v2.9")
