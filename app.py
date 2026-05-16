import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go

# \u30da\u30fc\u30b8\u8a2d\u5b9a
st.set_page_config(
            page_title="TikTok Lite Strategy Simulator",
            page_icon="\ud83d\udcf1",
            layout="wide",
            initial_sidebar_state="expanded"
)

# \u30b9\u30bf\u30a4\u30eb
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

st.title("\ud83d\udcf1 TikTok Lite \u904b\u7528\u6226\u7565\u30b7\u30df\u30e5\u30ec\u30fc\u30bf\u30fc")
st.markdown("1800\u53f0\u4f53\u5236\u3067\u306e\u62db\u5f85\u30fb\u56de\u8ee2\u30fb\u53ce\u76ca\u3092\u6700\u9069\u5316\u3059\u308b\u305f\u3081\u306e\u53c2\u8b00\u30c4\u30fc\u30eb")

# --- \u30bb\u30c3\u30b7\u30e7\u30f3\u72b6\u614b\u306e\u521d\u671f\u5316 ---
if 'rewards' not in st.session_state:
            st.session_state.rewards = {
                            "tier1": {"amount": 1350, "prob": 40},
                            "tier2": {"amount": 2700, "prob": 40},
                            "tier3": {"amount": 6750, "prob": 20}
            }
