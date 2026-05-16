import streamlit as st
import pandas as pd

st.title("TikTok Lite ポイ活シミュレーター")

# 1. 招待種別マスタの初期値
if 'master_data' not in st.session_state:
    st.session_state.master_data = pd.DataFrame({
        '招待種別':['ブタ2500', 'ブタ5000', '相互即招待', 'QRコード招待', 'チェックイン5000'],
        '単価':[2500, 5000, 3000, 1000, 5000]
    })

# 2. 複数の招待パターンの管理UI
if 'rows' not in st.session_state:
    st.session_state.rows =[{'種類': 'ブタ2500', '単価': 2500, '台数': 100, '成功率': 0.8}]

if st.button("パターンを追加"):
    st.session_state.rows.append({'種類': 'ブタ2500', '単価': 2500, '台数': 0, '成功率': 0.8})

# 3. 入力フォームの描画
total_profit = 0
for i, row in enumerate(st.session_state.rows):
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        row['種類'] = st.selectbox(f"種類 {i+1}", st.session_state.master_data['招待種別'], key=f"type_{i}")
    with col2:
        row['単価'] = st.number_input(f"単価 {i+1}", value=int(st.session_state.master_data[st.session_state.master_data['招待種別']==row['種類']]['単価'].values[0]), key=f"price_{i}")
    with col3:
        row['台数'] = st.number_input(f"台数 {i+1}", value=row['台数'], key=f"count_{i}")
    with col4:
        row['成功率'] = st.slider(f"成功率 {i+1}", 0.0, 1.0, row['成功率'], key=f"rate_{i}")
    
    # 計算
    row['利益'] = row['単価'] * row['台数'] * row['成功率']
    total_profit += row['利益']

st.write("---")
st.subheader(f"合計予測利益: {total_profit:,.0f} 円")
