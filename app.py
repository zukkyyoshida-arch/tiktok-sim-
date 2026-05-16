import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Lite Strategy Simulator v3.4",
    page_icon="🪄",
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

st.title("📱 TikTok Lite 運用戦略シミュレーター v3.4")

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
    if not edited_rows:
        return df
    
    # 最後に編集された行のインデックスと新しい値を取得
    idx = int(list(edited_rows.keys())[-1])
    if "出現確率(%)" not in edited_rows[str(idx)]:
        return df
    
    new_val = float(edited_rows[str(idx)]["出現確率(%)"])
    new_val = max(0, min(100, new_val)) # 0-100に制限
    
    # 他の行のインデックス
    other_indices = [i for i in range(len(df)) if i != idx]
    if not other_indices:
        df.at[idx, "出現確率(%)"] = 100.0
        return df
    
    # 他の行の現在の合計
    other_sum = df.loc[other_indices, "出現確率(%)"].sum()
    remaining = 100.0 - new_val
    
    if other_sum > 0:
        # 比率を維持して調整
        df.loc[other_indices, "出現確率(%)"] = (df.loc[other_indices, "出現確率(%)"] / other_sum) * remaining
    else:
        # 他が0なら均等に割り振り
        df.loc[other_indices, "出現確率(%)"] = remaining / len(other_indices)
    
    df.at[idx, "出現確率(%)"] = new_val
    return df

# --- タブ ---
tab1, tab2, tab3, tab4 = st.tabs(["📊 ダッシュボード", "🔄 稼働分析", "💰 報酬・種別管理", "📈 実績分析"])

with tab3:
    st.subheader("💼 招待種別の管理")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    c_inv = st.session_state.invite_types_df.fillna(0)
    w_immediate = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
    w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)

    st.divider()
    st.subheader("🎁 チェックイン追加報酬の管理（🪄 自動バランス調整付）")
    st.info("一つの確率を変えると、他が自動で調整され合計100%を維持します。")
    
    # データエディタの変更を検知
    edited_checkin = st.data_editor(
        st.session_state.checkin_rewards_df, 
        num_rows="dynamic", 
        use_container_width=True,
        key="checkin_editor"
    )
    
    # 変更があった場合にバランス調整を実行
    if st.session_state.get("checkin_editor") and st.session_state.checkin_editor.get("edited_rows"):
        balanced_df = balance_probabilities(edited_checkin.copy(), st.session_state.checkin_editor["edited_rows"])
        st.session_state.checkin_rewards_df = balanced_df
        st.rerun() # 再描画して数値を反映
    else:
        st.session_state.checkin_rewards_df = edited_checkin

    c_check = st.session_state.checkin_rewards_df.fillna(0)
    expected_checkin = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)
    st.write(f"現在のチェックイン期待値: **¥{int(expected_checkin):,}** (合計: {c_check['出現確率(%)'].sum():.1f}%)")

# (サイドバー、タブ1, 2, 4 のロジックは維持)
with st.sidebar:
    st.header("⚙️ 基本パラメーター")
    total_devices = st.number_input("総端末数", value=1800)
    parent_count = st.number_input("親端末数", value=300)
    success_rate = st.slider("招待成功率 (%)", 0.0, 100.0, 80.0) / 100
    keep_rate_success = 1.0; keep_rate_fail = 0.3

# 簡易計算ロジック
ratio_keep = (success_rate * keep_rate_success) + ((1-success_rate) * keep_rate_fail)
avg_child_cycle = (26.5 * ratio_keep) + (13.5 * (1-ratio_keep))
actual_daily_invites = min(parent_count/6, (total_devices-parent_count)/avg_child_cycle)
per_invite_revenue = (w_immediate * success_rate) + ((w_task + expected_checkin + 1000) * ratio_keep)

with tab1:
    st.metric("1日あたり招待数", f"{actual_daily_invites:.1f} 件")
    st.metric("月間予測収益", f"¥{int(actual_daily_invites * 30 * per_invite_revenue):,}")

st.sidebar.markdown("---")
st.sidebar.caption("TikTok Lite Strategy Simulator v3.4")
