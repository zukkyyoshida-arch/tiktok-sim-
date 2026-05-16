import streamlit as st
import pandas as pd
import json

st.title("TikTok Lite 運用シミュレーター")

# パターン管理用の初期データ（JSON形式）
if 'patterns' not in st.session_state:
    st.session_state.patterns = {
        "ブタ2500": 2500,
        "ブタ5000": 5000,
        "相互即招待": 3000,
        "QRコード招待": 1000,
        "チェックイン5000": 5000
    }

# --- サイドバー：パターン管理 ---
st.sidebar.header("パターン管理")
new_name = st.sidebar.text_input("新しいパターン名")
new_price = st.sidebar.number_input("単価", value=1000)
if st.sidebar.button("パターンを追加"):
    st.session_state.patterns[new_name] = new_price
    st.sidebar.success(f"{new_name} を追加しました")

if st.sidebar.button("パターンをリセット"):
    st.session_state.patterns = {"ブタ2500": 2500}

# --- メイン：運用シミュレーション ---
st.subheader("運用計算")
selected_pattern = st.selectbox("招待種類を選択", list(st.session_state.patterns.keys()))
current_price = st.session_state.patterns[selected_pattern]

total_devices = st.number_input("稼働端末数", value=1800)
success_rate = st.slider("成功率 (%)", 0, 100, 5) / 100
duration = st.number_input("シミュレーション日数", value=30)

# 計算
daily_success = total_devices * success_rate
revenue = daily_success * current_price * duration

st.metric("予測売上 (設定期間)", f"{int(revenue):,} 円")
st.write(f"現在の単価: {current_price} 円")

# 管理テーブル表示
st.subheader("現在のパターン一覧")
df = pd.DataFrame(list(st.session_state.patterns.items()), columns=['種類', '単価'])
st.table(df)
