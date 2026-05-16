import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re

# ページ設定
st.set_page_config(
    page_title="TikTok Studio Midnight v8.0",
    page_icon="🕶️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- 漆黒のプレミアム・ダークモード CSS ---
st.markdown("""
    <style>
    .main { background-color: #000000; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    [data-testid="stSidebar"] { background-color: #050505; border-right: 1px solid #222222; }
    h1, h2, h3 { color: #ffffff; font-weight: 700; letter-spacing: -0.02em; }
    .metric-container {
        background-color: #0a0a0a; padding: 24px; border-radius: 12px; border: 1px solid #1a1a1a;
        text-align: left; transition: border 0.3s ease; margin-bottom: 20px;
    }
    .metric-container:hover { border-color: #333333; }
    .metric-label { color: #888888; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; }
    .metric-value { color: #ffffff; font-size: 2.2rem; font-weight: 700; line-height: 1.2; }
    .metric-sub { color: #00ff88; font-size: 0.8rem; margin-top: 4px; }
    
    /* アドバイス・カード */
    .advice-card {
        background-color: #050a15; padding: 24px; border-radius: 12px; border: 1px solid #0044ff;
        margin-bottom: 30px; line-height: 1.6;
    }
    .advice-title { color: #0088ff; font-weight: 700; font-size: 1.2rem; margin-bottom: 12px; display: flex; align-items: center; }
    .advice-text { color: #e0e0e0; font-size: 1rem; }
    
    .stTabs [data-baseweb="tab-list"] { gap: 20px; background-color: #000000; border-bottom: 1px solid #111111; }
    .stTabs [data-baseweb="tab"] { height: 48px; background-color: transparent; color: #666666; font-weight: 600; font-size: 1rem; border: none; }
    .stTabs [aria-selected="true"] { color: #0088ff !important; border-bottom: 2px solid #0088ff !important; }
    .stButton>button {
        background: linear-gradient(135deg, #0088ff 0%, #0044ff 100%);
        color: white; border-radius: 8px; border: none; padding: 10px 24px; font-weight: 600;
        box-shadow: 0 4px 15px rgba(0, 136, 255, 0.2);
    }
    </style>
    """, unsafe_allow_html=True)

def custom_metric(label, value, sub_text=""):
    st.markdown(f"""<div class="metric-container"><div class="metric-label">{label}</div><div class="metric-value">{value}</div><div class="metric-sub">{sub_text}</div></div>""", unsafe_allow_html=True)

# --- セッション状態 ---
if 'invite_types_df' not in st.session_state:
    st.session_state.invite_types_df = pd.DataFrame([
        {"キャンペーン名": "ブタ5000", "即時報酬": 5000, "完走報酬": 0, "運用比率(%)": 100.0},
        {"キャンペーン名": "ブタ2500", "即時報酬": 2500, "完走報酬": 2500, "運用比率(%)": 0.0},
        {"キャンペーン名": "QRコード招待", "即時報酬": 3000, "完走報酬": 0, "運用比率(%)": 0.0}
    ])
if 'video_rewards_df' not in st.session_state:
    st.session_state.video_rewards_df = pd.DataFrame([{"動画パターン名": "通常再生報酬", "報酬額": 1000, "有効": True}])
if 'checkin_rewards_df' not in st.session_state:
    st.session_state.checkin_rewards_df = pd.DataFrame([{"報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 100.0}])
if 'actual_res' not in st.session_state: st.session_state.actual_res = None

# --- サイドバー設定 ---
with st.sidebar:
    st.markdown("<h2 style='color:#0088ff;'>設定パネル</h2>", unsafe_allow_html=True)
    total_dev = st.number_input("総デバイス数", value=1800)
    parent_dev = st.number_input("親デバイス数", value=300)
    st.markdown("---")
    default_s = 80.0
    if st.session_state.actual_res: default_s = st.session_state.actual_res['rate']
    success_p = st.slider("想定成功率 (%)", 0, 100, int(round(default_s)), step=1) / 100
    keep_s = st.slider("成功時キープ率 (%)", 0, 100, 100) / 100
    keep_f = st.slider("失敗時キープ率 (%)", 0, 100, 30) / 100

# --- 計算ロジック ---
child_dev = total_dev - parent_dev
prep_d = 12.5; check_d = 14; p_cycle = 6
r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
avg_cycle = ((prep_d + check_d) * r_keep) + ((prep_d + 1) * (1-r_keep))
daily_parent_cap = parent_dev / p_cycle
daily_child_cap = child_dev / avg_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

c_inv = st.session_state.invite_types_df.fillna(0)
w_immediate = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)
c_check = st.session_state.checkin_rewards_df.fillna(0)
expected_checkin_reward = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)
per_invite_revenue = (w_immediate * success_p) + ((w_task + expected_checkin_reward + 1000) * r_keep)

# --- 解析関数 ---
def fetch_data(f_mode, l_days=None, t_month=None):
    sheet_id = "1R0PmlqcwTwQLuv_sDJ7UiMkpLBbBDdLzhV-hSUJllUQ"
    gid = "937207441"
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    try:
        df = pd.read_csv(url, header=4)
        f_col, l_col, q_col, j_col = df.columns[5], df.columns[11], df.columns[16], df.columns[9]
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
        df['model'] = df[j_col].fillna("不明")
        def get_brand(model_name):
            m = str(model_name).upper()
            if "XPERIA" in m: return "Xperia"
            if "AQUOS" in m or "SH-" in m: return "AQUOS"
            if "PIXEL" in m: return "Pixel"
            if "GALAXY" in m: return "Galaxy"
            if "IPHONE" in m: return "iPhone"
            return "その他"
        df['brand'] = df['model'].apply(get_brand)
        df = df[~df[q_col].astype(str).str.match(r'^\d{4}$')].copy()
        if f_mode == "直近28日間": rdf = df[df['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            rdf = df[(df['date'].dt.year == target_dt.year) & (df['date'].dt.month == target_dt.month)].copy()
        if len(rdf) == 0: return "No Data"
        
        sum_df = rdf.groupby(q_col).agg(試行数=('is_success','count'), 成功数=('is_success','sum'), 成功率=('is_success','mean')).reset_index()
        sum_df['成功率'] = np.ceil(sum_df['成功率']*100*1000)/1000
        brand_df = rdf.groupby('brand').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        brand_df['成功率'] = np.ceil(brand_df['成功率']*100*1000)/1000
        
        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}"
        }
        return None
    except Exception as e: return str(e)

# --- タブ表示 ---
tab_dash, tab_analytics, tab_device, tab_sim, tab_config = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "📱 機種別分析", "🔄 稼働シミュレーション", "⚙️ 設定"])

with tab_dash:
    # --- AI総評 & アドバイスセクション ---
    st.markdown("### 📊 運用コンサルタントの総評 & アドバイス")
    
    advice_content = []
    # ボトルネック判定
    if daily_parent_cap < daily_child_cap:
        advice_content.append("⚠️ **親端末が不足しています**: 現在、親端末の回転が全体のボトルネックとなり、収益機会を逃しています。親端末を増やすか、休息日を1日減らすことを推奨します。")
    else:
        advice_content.append("⚠️ **子端末が余剰気味です**: 親端末の数に対して、子端末の回転が追いついていません。子端末の準備時間を短縮するか、全体の招待数を増やすために親を追加してください。")
    
    # 成功率判定
    if st.session_state.actual_res:
        act_rate = st.session_state.actual_res['rate']
        if act_rate < 70:
            advice_content.append(f"🚨 **成功率の低下**: 実績成功率が{act_rate:.1f}%と低迷しています。「機種別分析」を確認し、不調な機種（Xperia等）を一時的に除外する等の対策が必要です。")
        elif act_rate > 85:
            advice_content.append(f"✨ **極めて良好な成功率**: 実績成功率{act_rate:.1f}%を維持しています。現在のキャンペーン種別と端末の組み合わせは最強です。このままスケールを検討しましょう。")
            
    # 収益性アドバイス
    if per_invite_revenue < 7000:
        advice_content.append("💡 **単価改善の余地**: 1招待あたりの期待収益が¥7,000を切っています。比率の高いキャンペーンを見直し、高単価なもの（5000円系）へ寄せることを検討してください。")

    st.markdown(f"""
        <div class="advice-card">
            <div class="advice-title">💎 本日の戦略サマリー</div>
            <div class="advice-text">
                {'<br><br>'.join(advice_content)}
            </div>
        </div>
    """, unsafe_allow_html=True)

    st.markdown("## 運用パフォーマンス予測")
    c1, c2, c3 = st.columns(3)
    with c1: custom_metric("予測月間収益", f"¥{int(actual_daily_invites * 30 * per_invite_revenue):,}", f"1招待単価: ¥{int(per_invite_revenue):,}")
    with c2: custom_metric("1日あたり招待予測", f"{actual_daily_invites:.1f} 件", f"最大効率: {actual_daily_invites*success_p:.1f} 成功/日")
    with c3: custom_metric("稼働のボトルネック", "親端末" if daily_parent_cap < daily_child_cap else "子端末", "ここを改善すると収益が伸びます")
    
    st.markdown("<br><h3>⚡ 本日のスポット計算</h3>", unsafe_allow_html=True)
    qc1, qc2, qc3 = st.columns(3)
    with qc1: s_c = st.number_input("利用可能な子端末", value=50)
    with qc2: s_p = st.number_input("利用可能な親端末", value=int(daily_parent_cap))
    with qc3:
        s_inv = min(s_c, s_p)
        st.markdown(f"<div style='background:#111; padding:24px; border-radius:12px; border:1px solid #00ff88;'>本日見込み収益: <span style='color:#00ff88; font-size:1.8rem; font-weight:700;'>¥{int(s_inv * per_invite_revenue):,}</span></div>", unsafe_allow_html=True)

# (実績分析、機種別分析、シミュレーション、設定タブの中身はv7.1を維持)
with tab_analytics:
    st.markdown("## リアルタイム実績分析")
    ac1, ac2, ac3 = st.columns([2,2,1])
    with ac1: f_m = st.radio("集計期間", ["直近28日間", "月指定"], horizontal=True, key="an_fmode")
    with ac2:
        if f_m == "直近28日間": l_d = 28; t_m = None
        else:
            months = [(datetime.now() - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)]
            t_m = st.selectbox("対象月", months, key="an_month"); l_d = None
    with ac3: st.write(""); st.write(""); btn_s = st.button("データを同期", use_container_width=True, key="an_sync")
    if btn_s: 
        err = fetch_data(f_m, l_days=l_d, t_month=t_m)
        if err: st.error(err)
        else: st.success("同期完了！")
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        st.markdown(f"**分析期間: {res['period']}**")
        mc1, mc2, mc3 = st.columns(3)
        with mc1: custom_metric("総試行数", f"{res['total']:,}")
        with mc2: custom_metric("成功数", f"{res['success']:,}")
        with mc3: custom_metric("平均成功率", f"{res['rate']:.3f}%")
        st.dataframe(res['summary'].sort_values('成功率', ascending=False), use_container_width=True, hide_index=True)

with tab_device:
    st.markdown("## 📱 機種別パフォーマンス・インサイト")
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        if "brand" in res:
            st.markdown("### 🏢 メーカー別成功率")
            b_df = res['brand'].sort_values('成功率', ascending=False)
            fig_brand = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
            fig_brand.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0")
            st.plotly_chart(fig_brand, use_container_width=True)

with tab_sim:
    st.markdown("## 回転戦略の深掘り")
    st.markdown(f"<div style='background:#111; padding:20px; border-radius:10px; border-left:4px solid #0088ff;'>平均回転サイクル: <b>{avg_cycle:.2f} 日</b></div>", unsafe_allow_html=True)
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### ✅ 成功時の挙動")
        custom_metric("成功・キープ", f"{success_p*keep_s*100:.1f}%", f"拘束期間: {prep_d + check_d:.1f} 日")
    with c2:
        st.markdown("#### ❌ 失敗時の挙動")
        custom_metric("失敗・キープ", f"{(1-success_p)*keep_f*100:.1f}%", f"拘束期間: {prep_d + check_d:.1f} 日")

with tab_config:
    st.markdown("## 報酬・種別設定")
    st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, num_rows="dynamic", use_container_width=True)
    st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, num_rows="dynamic", use_container_width=True)
    st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, num_rows="dynamic", use_container_width=True)

st.sidebar.markdown("---")
st.sidebar.caption("Midnight Pro v8.0 | Strategy Consultant Edition")
