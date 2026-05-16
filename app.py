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

# --- \u30b5\u30a4\u30c9\u30d0\u30fc\uff1a\u57fa\u672c\u8a2d\u5b9a ---
with st.sidebar:
        st.header("\u2699\ufe0f \u57fa\u672c\u30d1\u30e9\u30e1\u30fc\u30bf\u30fc")

    with st.expander("\ud83d\udc65 \u7aef\u672b\u69cb\u6210", expanded=True):
                total_devices = st.number_input("\u7d42\u7aef\u672b\u6570", value=1800, step=10)
                parent_count = st.number_input("\u89aa\u7aef\u672b\u6570 (\u56fa\u5b9a)", value=300, step=10)
                child_count = total_devices - parent_count
                st.info(f"\u5b50\u7aef\u672b\u6570: {child_count} \u53f0")

    with st.expander("\u23f3 \u30b5\u30a4\u30af\u30eb\u8a2d\u5b9a", expanded=True):
                parent_rest_days = st.number_input("\u89aa\u306e\u4f11\u606f\u65e5 (\u4e2dN\u65e5)", value=5)
                prep_hours = st.number_input("\u5b50\u306e\u6e96\u5099\u6642\u9593 (\u6642\u9593)", value=300)
                checkin_days = st.number_input("\u30c1\u30a7\u30c3\u30af\u30a4\u30f3\u671f\u9593 (\u65e5)", value=14)

        prep_days = prep_hours / 24
        parent_cycle = parent_rest_days + 1
        child_cycle = prep_days + checkin_days

    with st.expander("\ud83d\udcb0 \u5831\u916c\u78ba\u7387\u8a2d\u5b9a", expanded=False):
                p1 = st.slider("1350\u5186\u306e\u78ba\u7387 (%)", 0, 100, st.session_state.rewards["tier1"]["prob"])
                p2 = st.slider("2700\u5186\u306e\u78ba\u7387 (%)", 0, 100 - p1, st.session_state.rewards["tier2"]["prob"])
                p3 = 100 - p1 - p2
                st.write(f"6750\u5186\u306e\u78ba\u7387: {p3}%")

        expected_reward = (1350 * p1/100) + (2700 * p2/100) + (6750 * p3/100)
        st.metric("\u671f\u5f85\u5831\u916c\u5358\u4fa1", f"\u00a5{int(expected_reward):,}")

# --- \u30ed\u30b8\u30c3\u30af\u8a08\u7b97 ---
# 1\u65e5\u3042\u305f\u308a\u306e\u30ad\u30e3\u30d1\u30b7\u30c7\u30a3
daily_parent_cap = parent_count / parent_cycle
daily_child_cap = child_count / child_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# \u30bf\u30d6\u69cb\u6210
tab1, tab2, tab3 = st.tabs(["\ud83d\udcca \u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9", "\ud83d\udd04 \u5e3d\u50cd\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3", "\ud83d\udee0 \u8a73\u7d30\u8a2d\u5b9a"])

with tab1:
        col1, col2, col3, col4 = st.columns(4)

    with col1:
                st.metric("1\u65e5\u3042\u305f\u308a\u306e\u62db\u5f85\u6570", f"{actual_daily_invites:.1f} \u4ef6")
            with col2:
                        monthly_revenue = actual_daily_invites * 30 * expected_reward
                        st.metric("\u6708\u9593\u4e88\u6e2c\u53ce\u76ca", f"\u00a5{int(monthly_revenue):,}")
                    with col3:
                                annual_revenue = monthly_revenue * 12
                                st.metric("\u5e74\u9593\u4e88\u6e2c\u53ce\u76ca", f"\u00a5{int(annual_revenue):,}")
                            with col4:
                                        bottleneck = "\u89aa\u7aef\u672b" if daily_parent_cap < daily_child_cap else "\u5b50\u7aef\u672b"
                                        st.metric("\u30dc\u30c8\u30eb\u30cd\u30c3\u30af", bottleneck)

    # \u30dc\u30c8\u30eb\u30cd\u30c3\u30af\u5206\u6790\u30a2\u30c9\u30d0\u30a4\u30b9
    st.subheader("\ud83d\udca1 \u53c2\u8b00\u306e\u30a2\u30c9\u30d0\u30a4\u30b9")
    if daily_parent_cap < daily_child_cap:
                needed_parents = (daily_child_cap * parent_cycle) - parent_count
                st.warning(f"\u73fe\u5728\u306f**\u89aa\u7aef\u672b**\u304c\u4e0d\u8db3\u3057\u3066\u3044\u307e\u3059\u3002\u3042\u3068 **{int(needed_parents)}\u53f0** \u89aa\u3092\u5897\u3084\u3059\u3068\u30011500\u53f0\u306e\u5b50\u7aef\u672b\u3092\u30d5\u30eb\u5e3d\u50cd\uff081\u65e5 {daily_child_cap:.1f} \u62db\u5f85\uff09\u3067\u304d\u307e\u3059\u3002")
else:
            extra_children_capacity = (daily_parent_cap - daily_child_cap) * child_cycle
            st.success(f"\u73fe\u5728\u306f**\u5b50\u7aef\u672b**\u306e\u4f9b\u7d66\u304c\u8ffd\u3044\u3064\u3044\u3066\u3044\u307e\u305b\u3093\u3002\u3042\u3068 **{int(extra_children_capacity)}\u53f0** \u5b50\u7aef\u672b\uff08\u307e\u305f\u306f\u7d42\u7aef\u672b\uff09\u3092\u5897\u3084\u3059\u3068\u3001\u89aa\u306e\u56de\u8ee2\u52b9\u7387\u3092\u6700\u5927\u5316\u3067\u304d\u307e\u3059\u3002")

    # \u53ce\u76ca\u63a8\u79fb\u30b0\u30e3\u30d5
        st.subheader("\ud83d\udcc8 \u53ce\u76ca\u63a8\u79fb\u30b0\u30e3\u30d5")
    sim_days = st.slider("\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3\u671f\u9593 (\u65e5)", 30, 365, 90)

    dates = pd.date_range(start="2024-01-01", periods=sim_days)
    daily_rev = actual_daily_invites * expected_reward
    cum_rev = np.cumsum([daily_rev] * sim_days)

    df_sim = pd.DataFrame({
                "\u65e5\u4ed8": dates,
                "\u7d2f\u7a4d\u53ce\u76ca": cum_rev
    })

    fig = px.line(df_sim, x="\u65e5\u4ed8", y="\u7d2f\u7a4d\u53ce\u76ca", title="\u7d2f\u7a4d\u53ce\u76ca\u306e\u4e88\u6e2c\u63a8\u79fb")
    fig.update_layout(template="plotly_dark", hovermode="x unified")
    st.plotly_chart(fig, use_container_width=True)

with tab2:
        st.subheader("\ud83d\udd04 \u30b5\u30a4\u30af\u30eb\u8a73\u7d30\u5206\u6790")

    c1, c2 = st.columns(2)
    with c1:
                st.info("### \u89aa\u7aef\u672b\u306e\u30b5\u30a4\u30af\u30eb")
                st.write(f"- \u7d42\u6570: {parent_count} \u53f0")
                st.write(f"- \u30b5\u30a4\u30af\u30eb: {parent_cycle} \u65e5 (\u5e3d\u50cd1 + \u4f11\u606f{parent_rest_days})")
                st.write(f"- 1\u65e5\u3042\u305f\u308a\u306e\u62db\u5f85\u53ef\u80fd\u67a0: **{daily_parent_cap:.1f} \u4ef6**")

    with c2:
                st.info("### \u5b50\u7aef\u672b\u306e\u30b5\u30a4\u30af\u30eb")
                st.write(f"- \u7d42\u6570: {child_count} \u53f0")
                st.write(f"- \u30b5\u30a4\u30af\u30eb: {child_cycle:.1f} \u65e5 (\u6e96\u5099{prep_days:.1f} + \u30c1\u30a7\u30c3\u30af\u30a4\u30f3{checkin_days})")
                st.write(f"- 1\u65e5\u3042\u305f\u308a\u306e\u4f9b\u7d66\u80fd\u529b: **{daily_child_cap:.1f} \u4ef6**")

    st.divider()

    st.subheader("\ud83d\udccb \u5e3d\u50cd\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb\u30a4\u30e1\u30fc\u30b8 (100\u53f0\u3042\u305f\u308a\u306e\u4f8b)")
    # \u7c21\u5358\u306a\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb\u53ef\u8996\u5316\uff08\u6982\u
