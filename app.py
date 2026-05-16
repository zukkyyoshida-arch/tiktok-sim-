import streamlit as st
import pandas as pd

st.title("TikTok Lite 運用シミュレーター")

# 設定セクション
st.sidebar.header("共通パラメータ")
total_devices = st.sidebar.number_input("全稼働子端末数", value=1800)
success_rate = st.sidebar.slider("1日あたりの招待成功率 (%)", 0, 100, 5) / 100

st.sidebar.subheader("報酬設定")
r1 = st.sidebar.number_input("報酬パターンA (円)", value=1350)
r2 = st.sidebar.number_input("報酬パターンB (円)", value=2700)
r3 = st.sidebar.number_input("報酬パターンC (円)", value=6750)

# タブの作成
tab1, tab2 = st.tabs(["📊 1日の運用", "📅 1ヶ月の運用"])

# --- タブ1: 1日の運用 ---
with tab1:
    st.subheader("本日の運用見込み")
    daily_success = total_devices * success_rate
    daily_revenue = daily_success * ((r1 + r2 + r3) / 3) # 平均単価で算出
    
    st.metric("本日の招待成功数", f"{int(daily_success)} 台")
    st.metric("本日の予測売上", f"{int(daily_revenue):,} 円")

# --- タブ2: 1ヶ月の運用 ---
with tab2:
    st.subheader("1ヶ月の累積収益")
    monthly_revenue = daily_revenue * 30
    
    proxy_cost = st.number_input("月間プロキシ・通信費", value=50000)
    device_cost = st.number_input("月間端末維持費", value=30000)
    
    net_profit = monthly_revenue - proxy_cost - device_cost
    
    st.metric("1ヶ月の総予測売上", f"{int(monthly_revenue):,} 円")
    st.metric("1ヶ月の純利益", f"{int(net_profit):,} 円")
    
    # グラフの表示（簡易的）
    df = pd.DataFrame({'日': range(1, 31), '累積売上': [daily_revenue * i for i in range(1, 31)]})
    st.line_chart(df.set_index('日'))
