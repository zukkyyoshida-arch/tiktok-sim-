import streamlit as st
import streamlit.components.v1 as components
import os

st.set_page_config(
    page_title="戦略MG（製造業）完全デジタル4人対戦ボード",
    page_icon="🎰",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Streamlitの不要なUI（ヘッダー、フッター、マージン）を非表示にし、画面いっぱいに表示
st.markdown("""
    <style>
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    .block-container {
        padding-top: 0rem;
        padding-bottom: 0rem;
        padding-left: 0rem;
        padding-right: 0rem;
    }
    iframe {
        border: none;
        width: 100vw;
        height: 100vh;
        background-color: #06070d;
    }
    </style>
""", unsafe_allow_html=True)

# ビルドされた単一HTMLファイル（inlined）を読み込んでiframeとして埋め込み
current_dir = os.path.dirname(os.path.abspath(__file__))
html_path = os.path.join(current_dir, "mg-4player-app", "dist", "index.html")

if os.path.exists(html_path):
    with open(html_path, "r", encoding="utf-8") as f:
        html_code = f.read()
    
    # コンポーネントを埋め込み (高さ100%に耐える設定)
    components.html(html_code, height=980, scrolling=True)
else:
    st.error(f"ビルド済みのHTMLファイルが見つかりません: {html_path}\n`mg-4player-app` ディレクトリで `npm run build` を実行してください。")
