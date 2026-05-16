import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import re
import json
import requests

# ページ設定
st.set_page_config(page_title="TikTok Studio Midnight v10.8", page_icon="🕶️", layout="wide", initial_sidebar_state="expanded")

# --- スプレッドシート連携 (GAS API) ロジック ---
GAS_URL = "https://script.google.com/macros/s/AKfycbwQuf80VDu7cqIaF2lM9CzIR1vFoDcFzxZzLU1rQakbgIgK6VW7c0EXtyQ8baZtaL3bzg/exec"

def save_settings_to_sheet():
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
        requests.post(GAS_URL, data=json.dumps(settings))
        return True
    except Exception as e:
        st.error(f"保存エラー: {e}")
        return False

def load_settings_from_sheet():
    try:
        response = requests.get(GAS_URL)
        if response.status_code == 200:
            settings = response.json()
            if not settings: return False
            
            # 運用比率のみをマスターリストに適用するロジック
            def sync_ratio(df, cloud_json, key_col):
                if not cloud_json: return df
                cloud_df = pd.read_json(cloud_json)
                if key_col not in cloud_df.columns or "運用比率(%)" not in cloud_df.columns: return df
                # 比率データをマッピング
                ratios = dict(zip(cloud_df[key_col], cloud_df["運用比率(%)"]))
                df["運用比率(%)"] = df[key_col].map(ratios).fillna(0.0)
                return df

            if "invite_types" in settings:
                st.session_state.invite_types_df = sync_ratio(st.session_state.invite_types_df, settings["invite_types"], "キャンペーン名")
            if "video_rewards" in settings:
                st.session_state.video_rewards_df = sync_ratio(st.session_state.video_rewards_df, settings["video_rewards"], "動画パターン名")
            if "checkin_rewards" in settings:
                cloud_checkin = pd.read_json(settings["checkin_rewards"])
                # チェックインは名前が変更されたため特殊処理
                if not cloud_checkin.empty:
                    # 以前の「報酬名」または新しい「チェックイン追加報酬名」でマッチング
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

# --- 初期化 (セーフティ・イニシャライザ) ---
for key, default in {
    "success_rate_val": 80,
    "keep_success_val": 100,
    "keep_failure_val": 30,
    "total_dev_val": 1800,
    "parent_dev_val": 300
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

# --- 初期化 (カラム名を厳密に定義) ---
if 'initialized' not in st.session_state:
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
    load_settings_from_sheet()
    st.session_state.initialized = True
if 'actual_res' not in st.session_state: st.session_state.actual_res = None

# --- UI デザイン ---
st.markdown("""
    <style>
    .main { background-color: #000000; color: #e0e0e0; }
    .metric-container { background-color: #0a0a0a; padding: 24px; border-radius: 12px; border: 1px solid #1a1a1a; margin-bottom: 20px; }
    .metric-label { color: #888888; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; }
    .metric-value { color: #ffffff; font-size: 2.5rem; font-weight: 700; }
    .metric-sub { color: #00ff88; font-size: 0.8rem; }
    .advice-card { background-color: #050a15; padding: 24px; border-radius: 12px; border: 1px solid #0044ff; margin-bottom: 30px; }
    .advice-title { color: #0088ff; font-weight: 700; font-size: 1.2rem; }
    </style>
    """, unsafe_allow_html=True)

def custom_metric(label, value, sub=""):
    st.markdown(f"<div class='metric-container'><div class='metric-label'>{label}</div><div class='metric-value'>{value}</div><div class='metric-sub'>{sub}</div></div>", unsafe_allow_html=True)

with st.sidebar:
    st.markdown("<h2 style='color:#0088ff;'>設定パネル</h2>", unsafe_allow_html=True)
    total_dev = st.number_input("総デバイス数", value=st.session_state.total_dev_val, key="total_dev")
    parent_dev = st.number_input("親デバイス数", value=st.session_state.parent_dev_val, key="parent_dev")
    st.markdown("---")
    success_p = st.slider("想定成功率 (%)", 0, 100, st.session_state.success_rate_val, step=1, key="success_rate_val") / 100
    keep_s = st.slider("成功時キープ率 (%)", 0, 100, st.session_state.keep_success_val, key="keep_success_val") / 100
    keep_f = st.slider("失敗時キープ率 (%)", 0, 100, st.session_state.keep_failure_val, key="keep_failure_val") / 100
    if st.sidebar.button("💾 クラウド保存", use_container_width=True):
        if save_settings_to_sheet(): st.sidebar.success("保存完了！")

# --- 計算ロジック (ここを修正) ---
child_dev = total_dev - parent_dev
prep_d = 12.5; check_d = 14; p_cycle = 6
r_keep = (success_p * keep_s) + ((1-success_p) * keep_f)
avg_cycle = ((prep_d + check_d) * r_keep) + ((prep_d + 1) * (1-r_keep))
daily_parent_cap = parent_dev / p_cycle
daily_child_cap = child_dev / avg_cycle
actual_daily_invites = min(daily_parent_cap, daily_child_cap)

# 各種報酬の合計をテーブルから動的に取得
c_inv = st.session_state.invite_types_df.fillna(0)
w_immediate = sum(c_inv["即時報酬"] * c_inv["運用比率(%)"] / 100)
w_task = sum(c_inv["完走報酬"] * c_inv["運用比率(%)"] / 100)

# 動画報酬 (運用比率に基づいて期待値を計算)
c_vid = st.session_state.video_rewards_df.fillna(0)
if "運用比率(%)" not in c_vid.columns: c_vid["運用比率(%)"] = 0.0
expected_video_reward = sum(c_vid["報酬額"] * c_vid["運用比率(%)"] / 100)

# チェックイン報酬
c_check = st.session_state.checkin_rewards_df.fillna(0)
expected_checkin_reward = sum(c_check["報酬額"] * c_check["出現確率(%)"] / 100)

# 1招待あたりの期待収益計算 (ハードコードを排除)
per_invite_revenue = (w_immediate * success_p) + ((w_task + expected_checkin_reward + expected_video_reward) * r_keep)

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
        df['date'] = df[l_col].apply(parse_date); df['is_success'] = df[f_col].astype(str).str.contains("成功")
        df['model'] = df[j_col].fillna("不明")
        def get_brand(model_name):
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
        df['brand'] = df['model'].apply(get_brand)
        df = df[~df[q_col].astype(str).str.match(r'^\d{4}$')].copy()
        if f_mode == "直近28日間": rdf = df[df['date'] >= (datetime.now() - timedelta(days=l_days))].copy()
        else:
            target_dt = datetime.strptime(t_month, "%Y/%m")
            rdf = df[(df['date'].dt.year == target_dt.year) & (df['date'].dt.month == target_dt.month)].copy()
        if len(rdf) == 0: return "No Data"
        sum_df = rdf.groupby(q_col).agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        sum_df['成功率'] = np.ceil(sum_df['成功率']*100*1000)/1000
        brand_df = rdf.groupby('brand').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        brand_df['成功率'] = np.ceil(brand_df['成功率']*100*1000)/1000
        model_df = rdf.groupby('model').agg(試行数=('is_success','count'), 成功率=('is_success','mean')).reset_index()
        model_df['成功率'] = model_df['成功率']*100
        # 日次トレンドの計算 (成功率と成功数の両方を取得)
        daily_df = rdf.groupby('date').agg(
            成功率=('is_success','mean'),
            成功数=('is_success','sum')
        ).reset_index()
        daily_df['成功率'] = daily_df['成功率'] * 100
        daily_df = daily_df.sort_values('date')

        st.session_state.actual_res = {
            "summary": sum_df, "rate": np.ceil(rdf['is_success'].mean()*100*1000)/1000,
            "brand": brand_df, "model_rank": model_df, "daily_trend": daily_df,
            "total": len(rdf), "success": rdf['is_success'].sum(),
            "period": f"{rdf['date'].min().strftime('%Y/%m/%d')} - {rdf['date'].max().strftime('%m/%d')}"
        }
        return None
    except Exception as e: return str(e)

tab_dash, tab_analytics, tab_device, tab_sim, tab_config = st.tabs(["🏠 ダッシュボード", "📊 実績分析", "📱 機種別分析", "🔄 稼働シミュレーション", "⚙️ 設定"])

with tab_dash:
    st.markdown("<h2 style='margin-bottom:20px;'>チャンネルの概要</h2>", unsafe_allow_html=True)
    monthly_revenue = actual_daily_invites * 30 * per_invite_revenue
    c1, c2, c3 = st.columns(3)
    with c1: custom_metric("予測月間収益", f"¥{int(monthly_revenue):,}", f"1招待期待: ¥{int(per_invite_revenue):,}")
    with c2: custom_metric("1日あたりの招待予測", f"{actual_daily_invites:.1f}", f"最大成功: {actual_daily_invites*success_p:.1f}/日")
    with c3: custom_metric("リソース稼働率", f"{r_keep*100:.1f}%", "端末回転の健全性")
    
    st.markdown("---")

    st.markdown("---")
    st.markdown("### 📊 運用コンサルタントの定量アドバイス")
    advice_content = []

    # 1. リソース・ボトルネック分析 (基本機能)
    if daily_parent_cap < daily_child_cap:
        req_p = int(np.ceil(daily_child_cap * p_cycle))
        advice_content.append(f"🔴 <b>親端末の不足</b>: あと <b>{req_p - parent_dev} 台</b> の親を追加すれば、月間収益は約 <b>¥{int((daily_child_cap - daily_parent_cap) * 30 * per_invite_revenue):,}</b> 増加します。")
    else:
        req_c = int(np.ceil(daily_parent_cap * avg_cycle))
        advice_content.append(f"🔵 <b>子端末の不足</b>: あと <b>{req_c - child_dev} 台</b> の子を追加すれば、月間収益を約 <b>¥{int((daily_parent_cap - daily_child_cap) * 30 * per_invite_revenue):,}</b> 上乗せできます。")

    # 実績データに基づく高度な分析
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        
        # 2. 成功率ギャップ分析 (現実と理想の乖離)
        actual_s_rate = res['rate'] / 100
        sim_s_rate = success_p
        gap = actual_s_rate - sim_s_rate
        if abs(gap) > 0.03: # 3%以上の乖離がある場合
            loss_gain = int(actual_daily_invites * 30 * gap * per_invite_revenue)
            if gap < 0:
                advice_content.append(f"⚠️ <b>成功率の下振れ注意</b>: 実績({actual_s_rate*100:.1f}%)が想定({sim_s_rate*100:.1f}%)を下回っています。このままでは月間収益が予測より <b>¥{abs(loss_gain):,}</b> 減少するリスクがあります。")
            else:
                advice_content.append(f"✨ <b>想定以上のパフォーマンス</b>: 実績成功率が想定を上回っています！月間予測に <b>¥{loss_gain:,}</b> のポジティブな上振れが期待できます。")

        # 3. 機種リプレイスによる機会損失の算出
        if "brand" in res:
            b_df = res['brand']
            if len(b_df) > 1:
                # 成功率トップとワーストを比較
                best_b = b_df.loc[b_df['成功率'].idxmax()]
                worst_b = b_df.loc[b_df['成功率'].idxmin()]
                diff_p = (best_b['成功率'] - worst_b['成功率']) / 100
                if diff_p > 0.05: # 5%以上の差がある場合
                    # そのブランドが占める実稼働シェア（試行数/全試行数）を基に計算
                    brand_share = worst_b['試行数'] / res['total']
                    potential = int(actual_daily_invites * 30 * diff_p * per_invite_revenue * brand_share)
                    advice_content.append(f"📱 <b>端末の最適化</b>: {worst_b['brand']} の成功率が低迷しています。これを {best_b['brand']} 並みに改善（またはリプレイス）することで、月間約 <b>¥{potential:,}</b> の増収が見込めます。")

        # 5. キャンペーン期待値のガチンコ比較 (ROI分析)
        s_df = res['summary']
        if len(s_df) > 1:
            # 各タイプの期待値を計算 (成功率/100 * 1招待あたりの収益)
            s_df['期待値'] = (s_df['成功率'] / 100) * per_invite_revenue
            best_c = s_df.loc[s_df['期待値'].idxmax()]
            if best_c['期待値'] > (actual_s_rate * per_invite_revenue) * 1.05: # 5%以上の改善が見込める場合
                boost = int(actual_daily_invites * 30 * (best_c['期待値'] - (actual_s_rate * per_invite_revenue)))
                advice_content.append(f"🎯 <b>戦略の転換推奨</b>: 実績データでは <b>{best_c.iloc[0]}</b> が最も効率的です。こちらにシフトすることで、月間収益をさらに <b>¥{boost:,}</b> 底上げできる可能性があります。")

        # 6. キープ失敗による「逃した魚」の可視化
        if keep_s < 1.0:
            lost_keep = int(actual_daily_invites * 30 * actual_s_rate * (1 - keep_s) * w_task)
            if lost_keep > 1000:
                advice_content.append(f"🎣 <b>脱落による機会損失</b>: 成功後の「完走」が <b>{keep_s*100:.0f}%</b> に留まっています。脱落をゼロにするだけで、月間 <b>¥{lost_keep:,}</b> の利益が上乗せされます。")

    # 7. 1台あたりの収益効率 (Yield)
    yield_per_dev = int(monthly_revenue / total_dev)
    advice_content.append(f"💰 <b>収益効率 (Yield)</b>: 現在、スマホ1台あたり月間 <b>¥{yield_per_dev:,}</b> を稼ぎ出しています。この数値を引き上げることが、スケールアウトの鍵です。")

    # 4. 総デバイス数固定での最適配分アドバイス (黄金比)
    p_opt = int(total_dev * p_cycle / (avg_cycle + p_cycle))
    c_opt = total_dev - p_opt
    
    # 現状と最適値の差
    diff_p = p_opt - parent_dev
    if abs(diff_p) >= 1: # 1台以上のズレがある場合
        # 最適化後の招待数
        opt_daily_invites = p_opt / p_cycle
        # 増収額 (1日あたり -> 月間)
        monthly_boost = int((opt_daily_invites - actual_daily_invites) * 30 * per_invite_revenue)
        
        if monthly_boost > 1000: # 有意な増収が見込める場合
            if diff_p > 0:
                advice_content.append(f"⚖️ <b>リソース配分の最適化</b>: 現在、子端末が過剰です。子端末 <b>{abs(diff_p)} 台</b> を「親」に転換して <b>親:{p_opt}台 / 子:{c_opt}台</b> の構成にすることで、追加投資なしで月間 <b>¥{monthly_boost:,}</b> の増収が可能です。")
            else:
                advice_content.append(f"⚖️ <b>リソース配分の最適化</b>: 現在、親端末が過剰です。親端末 <b>{abs(diff_p)} 台</b> を「子」に転換して <b>親:{p_opt}台 / 子:{c_opt}台</b> の構成にすることで、回転効率が上がり月間 <b>¥{monthly_boost:,}</b> の増収が可能です。")

    if not advice_content:
        advice_content.append("✅ 現在の運用バランスは非常に良好です。実績データを同期し続けることで、さらに細かい最適化ポイントを抽出します。")

    # アドバイスカードの描画
    st.markdown(f"<div class='advice-card'><div class='advice-title'>💎 定量アクションプラン</div><div class='advice-text'>{'<br><br>'.join(advice_content)}</div></div>", unsafe_allow_html=True)

with tab_analytics:
    st.markdown("## リアルタイム実績分析")
    ac1, ac2, ac3 = st.columns([2,2,1])
    with ac1: f_m = st.radio("集計期間", ["直近28日間", "月指定"], horizontal=True, key="an_fmode")
    with ac2:
        if f_m == "直近28日間": l_d = 28; t_m = None
        else: t_m = st.selectbox("対象月", [(datetime.now() - timedelta(days=30*i)).strftime("%Y/%m") for i in range(12)], key="an_month"); l_d = None
    with ac3: st.write(""); btn_s = st.button("データを同期", use_container_width=True, key="an_sync")
    if btn_s: fetch_data(f_m, l_days=l_d, t_month=t_m)
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        mc1, mc2, mc3 = st.columns(3)
        with mc1:
            custom_metric("総試行数", f"{res['total']:,}")
        with mc2:
            custom_metric("成功数", f"{res['success']:,}")
        with mc3:
            custom_metric("成功率", f"{res['rate']:.3f}%")
        
        # 成功率のグラフを表示 (キャンペーン別)
        st.markdown("### 📈 キャンペーン別 成功率ランキング")
        s_df = res['summary'].sort_values('成功率', ascending=False)
        fig_success = px.bar(
            s_df, x='成功率', y=s_df.columns[0], orientation='h',
            color='成功率', color_continuous_scale='RdYlGn',
            text_auto='.2f', labels={'成功率': '成功率 (%)', s_df.columns[0]: 'タイプ'}
        )
        fig_success.update_layout(
            plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)',
            font_color="#e0e0e0", height=max(300, len(s_df)*40),
            margin=dict(l=0, r=0, t=20, b=0)
        )
        st.plotly_chart(fig_success, use_container_width=True)

        # 統合トレンドグラフを表示 (成功数と成功率の2軸)
        if "daily_trend" in res:
            st.markdown("### 📈 日次パフォーマンス・トレンド (成功数 × 成功率)")
            d_df = res['daily_trend']
            
            from plotly.subplots import make_subplots
            fig_comb = make_subplots(specs=[[{"secondary_y": True}]])

            # 成功数 (棒グラフ - 左軸)
            fig_comb.add_trace(
                go.Bar(x=d_df['date'], y=d_df['成功数'], name="成功数 (台)", 
                       marker_color='rgba(0,136,255,0.6)', offsetgroup=1),
                secondary_y=False,
            )

            # 成功率 (折れ線グラフ - 右軸)
            fig_comb.add_trace(
                go.Scatter(x=d_df['date'], y=d_df['成功率'], name="成功率 (%)", 
                           line=dict(color='#00ff88', width=3), marker=dict(size=8),
                           mode='lines+markers'),
                secondary_y=True,
            )

            fig_comb.update_layout(
                plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)',
                font_color="#e0e0e0", height=450,
                xaxis=dict(showgrid=False),
                yaxis=dict(title="成功端末数 (台)", showgrid=True, gridcolor='#222'),
                yaxis2=dict(title="成功率 (%)", showgrid=False, overlaying='y', side='right', range=[0, 100]),
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                margin=dict(l=0, r=0, t=50, b=0)
            )
            st.plotly_chart(fig_comb, use_container_width=True)

with tab_device:
    st.markdown("## 📱 機種別パフォーマンス")
    if st.session_state.actual_res:
        res = st.session_state.actual_res
        if "brand" in res:
            b_df = res['brand'].sort_values('成功率', ascending=False)
            fig_brand = px.bar(b_df, x='成功率', y='brand', orientation='h', color='成功率', color_continuous_scale='RdYlGn', text_auto='.3f')
            fig_brand.update_layout(plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)', font_color="#e0e0e0"); st.plotly_chart(fig_brand, use_container_width=True)
            if "model_rank" in res:
                m_df = res['model_rank'].sort_values('成功率', ascending=False); display_m = m_df[m_df['試行数'] >= 1].copy(); display_m['成功率'] = display_m['成功率'].map('{:.3f}%'.format); st.dataframe(display_m, use_container_width=True, hide_index=True)

with tab_sim:
    st.markdown("## 🔄 稼働シミュレーション・インサイト")
    st.markdown(f"<div style='background:#111; padding:24px; border-radius:12px; border-left:5px solid #0088ff; margin-bottom:30px;'>平均回転サイクル: <b>{avg_cycle:.2f} 日</b></div>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1:
        custom_metric("1招待期待収益", f"¥{int(per_invite_revenue):,}")
    with c2:
        custom_metric("親の1日処理能力", f"{daily_parent_cap:.1f} 件")
    with c3:
        custom_metric("子の1日回転数", f"{daily_child_cap:.1f} 件")
    st.markdown("---")
    st.markdown("### ⚙️ 回転戦略の詳細内訳")
    sc1, sc2 = st.columns(2)
    with sc1: st.markdown("<div style='background:#0a0a0a; padding:20px; border-radius:10px; border:1px solid #1a1a1a;'><b>✅ 成功時の挙動</b><br>発生確率: "+f"{success_p*100:.1f}%<br>キープ率: "+f"{keep_s*100:.1f}%<br>拘束期間: "+f"{prep_d + check_d:.1f} 日</div>", unsafe_allow_html=True)
    with sc2: st.markdown("<div style='background:#0a0a0a; padding:20px; border-radius:10px; border:1px solid #1a1a1a;'><b>❌ 失敗時の挙動</b><br>発生確率: "+f"{(1-success_p)*100:.1f}%<br>キープ率: "+f"{keep_f*100:.1f}%<br>拘束期間: "+f"{(prep_d+check_d) if keep_f > 0 else (prep_d+1):.1f} 日</div>", unsafe_allow_html=True)

with tab_config:
    st.markdown("## 報酬・種別設定 (運用比率のみ編集可能)")
    
    st.markdown("### 1. 招待キャンペーン設定")
    new_invite_df = st.data_editor(
        st.session_state.invite_types_df, 
        use_container_width=True, 
        disabled=["キャンペーン名", "即時報酬", "完走報酬"],
        column_config={
            "運用比率(%)": st.column_config.SelectboxColumn(
                "運用比率(%)",
                options=[float(i) for i in range(0, 110, 10)],
                required=True,
            )
        },
        key="editor_invite_types"
    )
    
    st.markdown("### 2. 動画報酬パターン設定")
    new_video_df = st.data_editor(
        st.session_state.video_rewards_df, 
        use_container_width=True, 
        disabled=["動画パターン名", "報酬額"],
        column_config={
            "運用比率(%)": st.column_config.SelectboxColumn(
                "運用比率(%)",
                options=[float(i) for i in range(0, 110, 10)],
                required=True,
            )
        },
        key="editor_video_rewards"
    )
    
    st.markdown("### 3. チェックイン追加報酬設定")
    new_checkin_df = st.data_editor(
        st.session_state.checkin_rewards_df, 
        use_container_width=True, 
        disabled=["チェックイン追加報酬名", "報酬額"],
        column_config={
            "出現確率(%)": st.column_config.SelectboxColumn(
                "出現確率(%)",
                options=[float(i) for i in range(0, 110, 10)],
                required=True,
            )
        },
        key="editor_checkin_rewards"
    )
    
    # 変更があったら即座にセッション状態に反映（計算に使うため）
    st.session_state.invite_types_df = new_invite_df
    st.session_state.video_rewards_df = new_video_df
    st.session_state.checkin_rewards_df = new_checkin_df
    
    st.markdown("---")
    if st.button("🚀 スプレッドシートに同期・保存", use_container_width=True):
        if save_settings_to_sheet():
            st.success("スプレッドシートへ完全に同期しました！")

st.sidebar.markdown("---")
st.sidebar.caption("Midnight Pro v10.8 | Spreadsheet Sync Fixed")
