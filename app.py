import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v3.6",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v3.6")

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

if 'checkin_rewards_df' not in st.session_state:
    st.session_state.checkin_rewards_df = pd.DataFrame([
        {"報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 40.0},
        {"報酬名": "ティア2", "報酬額": 2700, "出現確率(%)": 40.0},
        {"報酬名": "ティア3", "報酬額": 6750, "出現確率(%)": 20.0}
    ])

# --- 自動バランス調整関数 ---
def balance_probabilities(df, edited_rows):
    if not edited_rows: return df
    idx = list(edited_rows.keys())[-1]
    row_data = edited_rows.get(idx) or edited_rows.get(str(idx))
    if not row_data or "出現確率(%)" not in row_data: return df
    new_val = max(0, min(100, float(row_data["出現確率(%)"])))
    idx_int = int(idx)
    other_indices = [i for i in range(len(df)) if i != idx_int]
    if not other_indices:
        df.iloc[idx_int, df.columns.get_loc("出現確率(%)")] = 100.0
        return df
    other_sum = df.iloc[other_indices]["出現確率(%)"].sum()
    remaining = 100.0 - new_val
    if other_sum > 0:
        df.iloc[other_indices, df.columns.get_loc("出現確率(%)")] = (df.iloc[other_indices]["出現確率(%)"] / other_sum) * remaining
    else:
        df.iloc[other_indices, df.columns.get_loc("出現確率(%)")] = remaining / len(other_indices)
    df.iloc[idx_int, df.columns.get_loc("出現確率(%)")] = new_val
    return df

# --- サイドバー ---
with st.sidebar:
    st.header("⚙️ パラメーター")
    total_devices = st.number_input("総端末数", value=1800)
    parent_count = st.number_input("親端末数", value=300)
    child_count = total_devices - parent_count
    success_rate = st.slider("想定成功率 (%)", 0.0, 100.0, 80.0) / 100
    keep_rate_success = st.slider("成功キープ率 (%)", 0, 100, 100) / 100
    keep_rate_fail = st.slider("失敗キープ率 (%)", 0, 100, 30) / 100

# --- ロジック ---
ratio_keep = (success_rate * keep_rate_success) + ((1-success_rate) * keep_rate_fail)
avg_child_cycle = (26.5 * ratio_keep) + (13.5 * (1-ratio_keep))
actual_daily_invites = min(parent_count/6, child_count/avg_child_cycle)

# --- タブ ---
tab1, tab2, tab3, tab4 = st.tabs(["📊 ダッシュボード", "🔄 稼働分析", "💰 報酬・種別管理", "📈 実績分析"])

with tab3:
    st.subheader("💼 招待種別の管理")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    c_inv = st.session_state.invite_types_df.fillna(0)
    w_immediate = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
    w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)

    st.divider()
    st.subheader("📺 動画再生報酬の管理")
    st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    c_vid = st.session_state.video_rewards_df.copy()
    if "有効" in c_vid.columns:
        c_vid["有効"] = c_vid["有効"].fillna(False).astype(bool)
        final_video = c_vid[c_vid["有効"]]["報酬額"].fillna(0).sum()
    else: final_video = 0
    st.write(f"現在の動画報酬合計: **¥{int(final_video):,}**")

    st.divider()
    st.subheader("🎁 チェックイン追加報酬の管理（🪄 自動バランス調整）")
    edited_checkin = st.data_editor(st.session_state.checkin_rewards_df, num_rows="dynamic", use_container_width=True, key="checkin_editor")
    if st.session_state.get("checkin_editor") and st.session_state.checkin_editor.get("edited_rows"):
        try:
            st.session_state.checkin_rewards_df = balance_probabilities(edited_checkin.copy(), st.session_state.checkin_editor["edited_rows"])
            st.rerun()
        except: pass
    else: st.session_state.checkin_rewards_df = edited_checkin

    c_check = st.session_state.checkin_rewards_df.fillna(0)
    expected_checkin = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)
    st.write(f"現在の期待値: **¥{int(expected_checkin):,}**")

    per_invite_revenue = (w_immediate * success_rate) + ((w_task + expected_checkin + final_video) * ratio_keep)

with tab1:
    st.subheader("📍 本日のスポット")
    cs1, cs2, cs3 = st.columns(3)
    with cs1: t_child = st.number_input("本日招待可能な子端末", value=50)
    with cs2: t_parent = st.number_input("本日稼働可能な親端末", value=int(parent_count/6))
    with cs3:
        t_inv = min(t_child, t_parent)
        st.metric("見込み収益", f"¥{int(t_inv * per_invite_revenue):,}")
    
    st.divider()
    st.subheader("📈 長期予測")
    col1, col2, col3 = st.columns(3)
    with col1: st.metric("1日あたり招待数", f"{actual_daily_invites:.1f} 件")
    with col2: st.metric("月間予測収益", f"¥{int(actual_daily_invites * 30 * per_invite_revenue):,}")
    with col3: st.metric("年間予測収益", f"¥{int(actual_daily_invites * 365 * per_invite_revenue):,}")

st.sidebar.markdown("---")
st.sidebar.caption("TikTok Lite Strategy Simulator v3.6")
