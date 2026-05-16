import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re
import json
import requests
from streamlit_autorefresh import st_autorefresh

# ==========================================
# 1. 定数・設定
# ==========================================
CURRENT_VERSION = "11.0.0"
GAS_URL = "https://script.google.com/macros/s/AKfycbwKESR5v8tWIU5hHHuVNIVNSwC2RhBSxwct4SlCBTmaYgPo79GDiTBTDiKvq6b3um-Svg/exec"

# ページ設定
st.set_page_config(
    page_title="Midnight Analytics v11.0",
    page_icon="🕶️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 10分ごとに自動更新 (600,000ミリ秒)
st_autorefresh(interval=600000, key="datarefresh")

# ==========================================
# 2. スタイル・UI部品
# ==========================================
def apply_custom_styles():
    st.markdown("""
        <style>
        .main { background-color: #000000; color: #e0e0e0; }
        .metric-container { background-color: #0a0a0a; padding: 24px; border-radius: 12px; border: 1px solid #1a1a1a; margin-bottom: 20px; }
        .metric-label { color: #888888; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; }
        .metric-value { color: #ffffff; font-size: 2.5rem; font-weight: 700; }
        .metric-sub { color: #00ff88; font-size: 0.8rem; }
        .advice-card { background-color: #050a15; padding: 24px; border-radius: 12px; border: 1px solid #0044ff; margin-bottom: 30px; }
        .advice-title { color: #0088ff; font-weight: 700; font-size: 1.2rem; }
        .advice-text { color: #e0e0e0; line-height: 1.6; }
        </style>
        """, unsafe_allow_html=True)

def custom_metric(label, value, sub=""):
    st.markdown(f"""
        <div class='metric-container'>
            <div class='metric-label'>{label}</div>
            <div class='metric-value'>{value}</div>
            <div class='metric-sub'>{sub}</div>
        </div>
        """, unsafe_allow_html=True)

# ==========================================
# 3. バックエンド通信ロジック
# ==========================================
@st.cache_data(ttl=600)
def fetch_api_data_raw(force_key=None):
    try:
        # force_key が指定されている場合は、URLにタイムスタンプを付与してネットワークキャッシュを回避
        url = f"{GAS_URL}?action=get_analytics"
        if force_key:
            url += f"&t={force_key}"
        response = requests.get(url, timeout=15)
        if response.status_code != 200: return None
        return response.json()
    except: return None

def fetch_data_logic(f_mode, l_days=None, t_month=None, force=False):
    try:
        # 同期ボタンからの呼び出し時は、現在の時刻をキーにしてキャッシュを回避
        f_key = str(datetime.now().timestamp()) if force else None
        payload = fetch_api_data_raw(force_key=f_key)
        if not payload or "analytics" not in payload: return "Invalid API Response"
        
        raw_data = payload['analytics']
        if not raw_data: return "No Data"
        
        df = pd.DataFrame(raw_data)
        # カラムインデックス: 5:成功/失敗, 9:機種, 11:日付, 13:親機, 16:キャンペーン
        f_idx, j_idx, l_idx, n_idx, q_idx = 5, 9, 11, 13, 16
        
        def parse_date(date_str):
            if not date_str or not isinstance(date_str, str): return pd.NaT
            clean = re.sub(r'\(.*?\)', '', date_str).strip()
            try:
                dt = datetime.strptime(f"{datetime.now().year}/{clean}", "%Y/%m/%d")
                if dt > datetime.now() + timedelta(days=1): dt = dt.replace(year=dt.year-1)
                return dt
            except: return pd.NaT

        df['date'] = df[l_idx].apply(parse_date)
        df['is_success'] = df[f_idx].astype(str).str.contains("成功")
        df['model'] = df[j_idx].fillna("不明")
        
        # 端末マスタ
        d_raw = payload.get('terminals', [])
        d_map = {str(row[3]): str(row[5]) for row in d_raw if len(row) > 5}
        
        rdf = df.copy()
        if f_mode == "直近28日間": 
            rdf = rdf[rdf['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            rdf = rdf[(rdf['date'].dt.year == target_dt.year) & (rdf['date'].dt.month == target_dt.month)].copy()
        
        if len(rdf) == 0: return "No Data for this period"

        rdf['parent_id'] = rdf[n_idx].fillna("未指定").astype(str)
        rdf['parent_model'] = rdf['parent_id'].map(d_map).fillna("不明")

        def get_brand_local(model_name):
            m = str(model_name).upper()
            if "XPERIA" in m: return "Xperia"
            if "AQUOS" in m or "SH-" in m: return "AQUOS"
            if "PIXEL" in m: return "Pixel"
            if "GALAXY" in m or "SC-" in m or "SM-" in m: return "Galaxy"
            if "IPHONE" in m: return "iPhone"
            if "OPPO" in m or "CPH" in m: return "OPPO"
            if "XIAOMI" in m or "REDMI" in m: return "Xiaomi"
            if "BASIO" in m or "KYV" in m: return "BASIO"
            if "HUAWEI" in m or "HW-" in m or "POT-" in m or "MAR-" in m: return "HUAWEI"
            return "その他"
        
        rdf['brand'] = rdf['model'].apply(get_brand_local)
        rdf = rdf[~rdf[q_idx].astype(str).str.match(r'^\d{4}$')].copy()

        # 集計
        sum_df = rdf.groupby(q_idx).agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        sum_df['成功率'] = np.ceil(sum_df['成功率']*100*1000)/1000
        
        parent_df = rdf.groupby('parent_id').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        parent_df['成功率'] = np.ceil(parent_df['成功率']*100*1000)/1000
        parent_df = parent_df[parent_df['試行数'] >= 3].sort_values('成功率', ascending=False)

        p_model_df = rdf.groupby('parent_model').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        p_model_df['成功率'] = np.ceil(p_model_df['成功率']*100*1000)/1000
        p_model_df = p_model_df.sort_values('成功率', ascending=False)

        brand_df = rdf.groupby('brand').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        brand_df['成功率'] = np.ceil(brand_df['成功率']*100*1000)/1000
        
        model_df = rdf.groupby('model').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        model_df['成功率'] = model_df['成功率']*100
        
        daily_df = rdf.groupby('date').agg(成功率=('is_success','mean'), 成功数=('is_success','sum')).reset_index()
        daily_df['成功率'] = daily_df['成功率'] * 100
        daily_df = daily_df.sort_values('date')

        # 結果をセッションに格納
        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "model_rank": model_df, "daily_trend": daily_df,
            "parent_rank": parent_df, "parent_model_rank": p_model_df,
            "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}"
        }
        return None
    except Exception as e: return str(e)

def save_settings_api():
    try:
        settings = {
            "invite_types": st.session_state.invite_types_df.to_json(orient='records'),
            "video_rewards": st.session_state.video_rewards_df.to_json(orient='records'),
            "checkin_rewards": st.session_state.checkin_rewards_df.to_json(orient='records'),
            "total_dev": str(st.session_state.get("total_dev", 1800)),
            "parent_dev": str(st.session_state.get("parent_dev", 300)),
            "success_rate": str(st.session_state.get("success_rate_val", 80)),
            "keep_success": str(st.session_state.get("keep_success_val", 100)),
            "keep_failure": str(st.session_state.get("keep_failure_val", 30))
        }
        requests.post(GAS_URL, data=json.dumps(settings), timeout=15)
        return True
    except: return False

def load_settings_api():
    try:
        response = requests.get(GAS_URL, timeout=10)
        if response.status_code == 200:
            settings = response.json()
            if not settings: return False
            
            def sync_ratio_local(df, cloud_json, key_col):
                if not cloud_json: return df
                cloud_df = pd.read_json(cloud_json)
                if key_col not in cloud_df.columns or "運用比率(%)" not in cloud_df.columns: return df
                ratios = dict(zip(cloud_df[key_col], cloud_df["運用比率(%)"]))
                df["運用比率(%)"] = df[key_col].map(ratios).fillna(0.0)
                return df

            if "invite_types" in settings:
                st.session_state.invite_types_df = sync_ratio_local(st.session_state.invite_types_df, settings["invite_types"], "キャンペーン名")
            if "video_rewards" in settings:
                st.session_state.video_rewards_df = sync_ratio_local(st.session_state.video_rewards_df, settings["video_rewards"], "動画パターン名")
            if "checkin_rewards" in settings:
                cloud_checkin = pd.read_json(settings["checkin_rewards"])
                if not cloud_checkin.empty:
                    key = "チェックイン追加報酬名" if "チェックイン追加報酬名" in cloud_checkin.columns else "報酬名"
                    ratios = dict(zip(cloud_checkin[key], cloud_checkin["出現確率(%)"]))
                    st.session_state.checkin_rewards_df["出現確率(%)"] = st.session_state.checkin_rewards_df["チェックイン追加報酬名"].map(ratios).fillna(0.0)

            st.session_state.total_dev_val = int(settings.get("total_dev", 1800))
            st.session_state.parent_dev_val = int(settings.get("parent_dev", 300))
            st.session_state.success_rate_val = int(settings.get("success_rate", 80))
            st.session_state.keep_success_val = int(settings.get("keep_success", 100))
            st.session_state.keep_failure_val = int(settings.get("keep_failure", 30))
            return True
    except: return False
    return False

# ==========================================
# 4. メイン・オーケストレーター
# ==========================================
def main():
    # --- 記憶のリセット（バージョン管理） ---
    if st.session_state.get('version') != CURRENT_VERSION:
        st.session_state.clear()
        st.session_state.version = CURRENT_VERSION

    # --- 道具の準備（初期化） ---
    if 'invite_types_df' not in st.session_state:
        st.session_state.invite_types_df = pd.DataFrame([
            {"キャンペーン名": "ブタ5000", "即時報酬": 5000, "完走報酬": 0, "運用比率(%)": 100.0},
            {"キャンペーン名": "ブタ2500", "即時報酬": 2500, "完走報酬": 2500, "運用比率(%)": 0.0},
            {"キャンペーン名": "QRコード招待", "即時報酬": 3000, "完走報酬": 0, "運用比率(%)": 0.0},
            {"キャンペーン名": "通常招待", "即時報酬": 0, "完走報酬": 5500, "運用比率(%)": 0.0},
            {"キャンペーン名": "ヒットチャレンジ", "即時報酬": 5500, "完走報酬": 0, "運用比率(%)": 0.0},
            {"キャンペーン名": "即招待", "即時報酬": 2800, "完走報酬": 0, "運用比率(%)": 0.0}
        ])
        st.session_state.video_rewards_df = pd.DataFrame([
            {"動画パターン名": "なし", "報酬額": 0, "運用比率(%)": 0.0},
            {"動画パターン名": "特別1350", "報酬額": 1350, "運用比率(%)": 100.0},
            {"動画パターン名": "特別2700", "報酬額": 2700, "運用比率(%)": 0.0},
            {"動画パターン名": "特別6000", "報酬額": 6000, "運用比率(%)": 0.0}
        ])
        st.session_state.checkin_rewards_df = pd.DataFrame([
            {"チェックイン追加報酬名": "ティア1", "報酬額": 1350, "出現確率(%)": 40.0},
            {"チェックイン追加報酬名": "ティア2", "報酬額": 2700, "出現確率(%)": 40.0},
            {"チェックイン追加報酬名": "チェックイン特別報酬", "報酬額": 6750, "出現確率(%)": 20.0}
        ])
        # スライダー等のデフォルト値
        for k, v in {"total_dev_val": 1800, "parent_dev_val": 300, "success_rate_val": 80, "keep_success_val": 100, "keep_failure_val": 30}.items():
            if k not in st.session_state: st.session_state[k] = v
        
        # 初回ロード
        load_settings_api()
        fetch_data_logic("直近28日間", l_days=28)
        st.session_state.initialized = True

    # --- 門番 ---
    if not st.session_state.get('initialized'):
        st.markdown("<h3 style='text-align:center; margin-top:100px;'>🕶️ Midnight Analytics 起動中...</h3>", unsafe_allow_html=True)
        st.stop()

    # --- UIデザイン適用 ---
    apply_custom_styles()

    # --- サイドバー表示 ---
    with st.sidebar:
        st.markdown("<h2 style='color:#0088ff;'>設定パネル</h2>", unsafe_allow_html=True)
        total_dev = st.number_input("総デバイス数", value=st.session_state.total_dev_val, key="total_dev")
        parent_dev = st.number_input("親デバイス数", value=st.session_state.parent_dev_val, key="parent_dev")
        st.markdown("---")
        success_p = st.slider("想定成功率 (%)", 0, 100, st.session_state.success_rate_val, step=1, key="success_rate_val") / 100
        keep_s = st.slider("成功時キープ率 (%)", 0, 100, st.session_state.keep_success_val, key="keep_success_val") / 100
        keep_f = st.slider("失敗時キープ率 (%)", 0, 100, st.session_state.keep_failure_val, key="keep_failure_val") / 100
        if st.sidebar.button("💾 クラウド保存", use_container_width=True):
            if save_settings_api(): st.sidebar.success("保存完了！")

    # --- 情報の整理（計算） ---
    child_dev = total_dev - parent_dev
    prep_d, check_d, p_cycle = 12.5, 14, 6
    r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
    avg_cycle = ((prep_d + check_d) * r_keep) + ((prep_d + 1) * (1-r_keep))
    daily_parent_cap = parent_dev / p_cycle
    daily_child_cap = child_dev / avg_cycle
    actual_daily_invites = min(daily_parent_cap, daily_child_cap)

    # 報酬計算
    c_inv = st.session_state.invite_types_df.fillna(0)
    w_imm = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
    w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)
    c_vid = st.session_state.video_rewards_df.fillna(0)
    w_vid = sum(c_vid["報酬額"] * c_vid.get("運用比率(%)", 0) / 100)
    c_check = st.session_state.checkin_rewards_df.fillna(0)
    w_check = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)
    per_invite_revenue = (w_imm * success_p) + ((w_task + w_check + w_vid) * r_keep)

    # --- 画面描画（タブ） ---
    tabs = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "📱 機種別分析", "👑 親機分析", "🔄 稼働シミュレーション", "⚙️ 設定"])

    # ダッシュボード
    with tabs[0]:
        st.markdown("<h2 style='margin-bottom:20px;'>チャンネルの概要</h2>", unsafe_allow_html=True)
        # 20時レポート
        if datetime.now().hour >= 20:
            st.info("🌙 **20:00を過ぎました。本日の運用データが確定しています。**")
            res = st.session_state.get('actual_res')
            if res and 'daily_trend' in res:
                today_str = datetime.now().strftime('%Y-%m-%d')
                d_trend = res['daily_trend']
                d_trend['date_str'] = pd.to_datetime(d_trend['date']).dt.strftime('%Y-%m-%d')
                today_res = d_trend[d_trend['date_str'] == today_str]
                if not today_res.empty:
                    st.success(f"📈 **本日のリザルト**: 成功 **{today_res.iloc[0]['成功数']}台** / 成功率 **{today_res.iloc[0]['成功率']:.1f}%**")

        rev = actual_daily_invites * 30 * per_invite_revenue
        col1, col2, col3 = st.columns(3)
        with col1: custom_metric("予測月間収益", f"¥{int(rev):,}", f"1招待期待: ¥{int(per_invite_revenue):,}")
        with col2: custom_metric("1日あたりの招待予測", f"{actual_daily_invites:.1f}", f"最大成功: {actual_daily_invites*success_p:.1f}/日")
        with col3: custom_metric("リソース稼働率", f"{r_keep*100:.1f}%", "端末回転の健全性")

        st.markdown("---")
        st.markdown("### 📊 運用コンサルタントの定量アドバイス")
        advice = []
        if daily_parent_cap < daily_child_cap:
            req_p = int(np.ceil(daily_child_cap * p_cycle))
            advice.append(f"🔴 **親端末の不足**: あと **{req_p - parent_dev} 台** 追加で収益 **¥{int((daily_child_cap - daily_parent_cap) * 30 * per_invite_revenue):,}** 増")
        else:
            req_c = int(np.ceil(daily_parent_cap * avg_cycle))
            advice.append(f"🔵 **子端末の不足**: あと **{req_c - child_dev} 台** 追加で収益 **¥{int((daily_parent_cap - daily_child_cap) * 30 * per_invite_revenue):,}** 増")
        
        if st.session_state.get('actual_res'):
            res = st.session_state.actual_res
            yield_val = int(rev / total_dev)
            advice.append(f"💰 **収益効率 (Yield)**: 端末1台あたり月間 **¥{yield_val:,}** を稼ぎ出しています。")
        
        st.markdown(f"<div class='advice-card'><div class='advice-title'>💎 戦略アクション</div><div class='advice-text'>{'<br><br>'.join(advice)}</div></div>", unsafe_allow_html=True)

    # 実績分析
    with tabs[1]:
        st.markdown("## リアルタイム実績分析")
        ac1, ac2, ac3 = st.columns([2,2,1])
        with ac1: fm = st.radio("期間", ["直近28日間", "月指定"], horizontal=True)
        with ac2:
            if fm == "直近28日間": ld, tm = 28, None
            else: tm = st.selectbox("対象月", [(datetime.now() - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)]); ld = None
        with ac3: st.write(""); sync = st.button("同期", use_container_width=True)
        if sync:
            with st.spinner("最新データを取得中..."):
                err = fetch_data_logic(fm, l_days=ld, t_month=tm, force=True)
                if err:
                    st.error(f"同期失敗: {err}")
                else:
                    st.success("最新データの同期に成功しました！")
                    st.rerun()
        
        res = st.session_state.get('actual_res')
        if res:
            c1, c2, c3 = st.columns(3)
            with c1: custom_metric("総試行", f"{res['total']:,}")
            with c2: custom_metric("成功数", f"{res['success']:,}")
            with c3: custom_metric("成功率", f"{res['rate']:.2f}%")
            
            s_df = res['summary'].sort_values('成功率', ascending=False)
            fig = px.bar(s_df, x='成功率', y=s_df.columns[0], orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.2f')
            fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0", height=400)
            st.plotly_chart(fig, use_container_width=True)

    # 機種別
    with tabs[2]:
        st.markdown("## 📱 機種別パフォーマンス")
        res = st.session_state.get('actual_res')
        if res and 'brand' in res:
            b_df = res['brand'].sort_values('成功率', ascending=False)
            fig = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
            fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0")
            st.plotly_chart(fig, use_container_width=True)

    # 親機
    with tabs[3]:
        st.markdown("## 👑 親機パフォーマンス分析")
        res = st.session_state.get('actual_res')
        if res and 'parent_rank' in res:
            c1, c2 = st.columns(2)
            with c1:
                st.markdown("### 🏆 個体別 (TOP10)")
                fig = px.bar(res['parent_rank'].head(10), x='成功率', y='parent_id', orientation='h', color='成功率', color_continuous_scale='Viridis', text_auto=True)
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', height=400)
                st.plotly_chart(fig, use_container_width=True)
            with c2:
                st.markdown("### 📱 機種別")
                fig = px.bar(res['parent_model_rank'], x='成功率', y='parent_model', orientation='h', color='成功率', color_continuous_scale='Magma', text_auto=True)
                fig.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', height=400)
                st.plotly_chart(fig, use_container_width=True)

    # シミュレーション
    with tabs[4]:
        st.markdown("## 🔄 稼働シミュレーション")
        st.markdown(f"<div style='background:#111; padding:20px; border-radius:10px; border-left:5px solid #0088ff;'>平均回転サイクル: <b>{avg_cycle:.2f} 日</b></div>", unsafe_allow_html=True)
        c1, c2, c3 = st.columns(3)
        with c1: custom_metric("1招待期待収益", f"¥{int(per_invite_revenue):,}")
        with c2: custom_metric("親の1日処理能力", f"{daily_parent_cap:.1f} 件")
        with c3: custom_metric("子の1日回転数", f"{daily_child_cap:.1f} 件")

    # 設定
    with tabs[5]:
        st.markdown("## ⚙️ 設定 (比率のみ編集可能)")
        st.session_state.invite_types_df = st.data_editor(st.session_state.invite_types_df, use_container_width=True, disabled=["キャンペーン名", "即時報酬", "完走報酬"], key="ed_inv")
        st.session_state.video_rewards_df = st.data_editor(st.session_state.video_rewards_df, use_container_width=True, disabled=["動画パターン名", "報酬額"], key="ed_vid")
        st.session_state.checkin_rewards_df = st.data_editor(st.session_state.checkin_rewards_df, use_container_width=True, disabled=["チェックイン追加報酬名", "報酬額"], key="ed_chk")
        if st.button("🚀 クラウドに保存", use_container_width=True, key="btn_save_full"):
            if save_settings_api(): st.success("保存完了！")

    st.sidebar.markdown("---")
    st.sidebar.caption(f"Midnight Platinum v{CURRENT_VERSION} | Real-time Engine")

if __name__ == "__main__":
    main()
