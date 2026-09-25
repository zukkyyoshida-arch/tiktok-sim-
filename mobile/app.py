"""
app.py — Tik分析アプリ モバイル版（スマホ向けの軽量ダッシュボード）。

本家 `../app.py`（PC向け・8タブ・wideレイアウト）と同じ GAS データを、
スマホの縦画面で片手で確認できる形に絞り込んだもの。

- 縦1カラム・大きめのタップ領域・横スクロール無し
- 「今日 / 実績 / 親機 / 相場」の4タブ
- 自動リフレッシュは行わず（電池・通信量の節約）、10分キャッシュ + 手動更新ボタン
- 中古相場は同梱スナップショットのみ（ライブ取得はしない）

起動: `streamlit run mobile/app.py`（リポジトリルートから）
Streamlit Cloud: Main file path に `mobile/app.py` を指定して別アプリとしてデプロイする。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from datetime import datetime  # noqa: E402

import pandas as pd  # noqa: E402
import plotly.graph_objects as go  # noqa: E402
import streamlit as st  # noqa: E402
from plotly.subplots import make_subplots  # noqa: E402

import analytics  # noqa: E402
import market  # noqa: E402

VERSION = "1.0.0"
APP_OPTIONS = {"TikTok Lite": "lite", "TikTok 本家": "original"}
DEFAULT_APP = "TikTok Lite"
DEFAULT_PERIOD = "28日"
DAILY_CHART_MAX_DAYS = 31   # スマホ幅で読める日数の上限
MODEL_TABLE_ROWS = 15
PARENT_TABLE_ROWS = 20

st.set_page_config(
    page_title="Tik分析 モバイル",
    page_icon="📱",
    layout="centered",
    initial_sidebar_state="collapsed",
    menu_items={"About": f"Tik分析アプリ モバイル版 v{VERSION}"},
)

# ==========================================
# テーマ・スタイル
# ==========================================
# 端末のライト/ダーク設定に追従する（本家のように背景を黒に固定すると、
# ライトテーマの端末でウィジェットの文字が読めなくなるため）。
PALETTES = {
    "dark": {
        "card": "#0f0f10", "border": "#26262a", "label": "#8a8a8a", "value": "#ffffff",
        "good": "#00ff88", "warn": "#ffaa00", "bad": "#ff4d4d", "note": "#777777",
        "hero_from": "#061426", "hero_border": "#0044ff", "accent": "#3b82f6", "accent2": "#00ff88",
    },
    "light": {
        "card": "#f4f6f9", "border": "#dfe3e8", "label": "#5b6270", "value": "#111111",
        "good": "#0a8f4a", "warn": "#b45309", "bad": "#dc2626", "note": "#6b7280",
        "hero_from": "#e8f0ff", "hero_border": "#3b82f6", "accent": "#2563eb", "accent2": "#0a8f4a",
    },
}


def palette():
    """カード色のパレットを決める。

    `.streamlit/config.toml` で theme.base が固定されていればそれに合わせ（Streamlit は
    メインスクリプトのディレクトリにある .streamlit/config.toml も読む）、
    固定されていなければ端末のライト/ダーク設定（st.context.theme）に追従する。
    """
    kind = None
    try:
        kind = st.get_option("theme.base")
    except Exception:
        pass
    if kind not in ("light", "dark"):
        try:
            kind = st.context.theme.type  # "light" | "dark"（Streamlit 1.46+）
        except Exception:
            kind = "dark"
    return PALETTES.get(kind, PALETTES["dark"])


def inject_css(p):
    st.markdown(f"""
    <style>
    /* 上部はStreamlitのヘッダ（約3.75rem）に隠れないよう空ける */
    .block-container {{ padding: 4rem 0.8rem 4rem 0.8rem; max-width: 720px; }}
    #MainMenu, footer {{ visibility: hidden; }}
    .block-container h4 {{ font-size: 1.1rem; padding-top: 0.6rem; padding-bottom: 0.2rem; }}
    .m-title {{ font-size: 1.35rem; font-weight: 800; margin: 0; }}
    .m-sub {{ color: {p['label']}; font-size: 0.78rem; margin: 2px 0 8px 0; }}
    .kpi-row {{ display: flex; gap: 8px; margin: 6px 0 10px 0; }}
    .kpi {{ flex: 1 1 0; min-width: 0; background: {p['card']}; border: 1px solid {p['border']};
            border-radius: 14px; padding: 12px 10px; }}
    .kpi-label {{ color: {p['label']}; font-size: 0.7rem; font-weight: 600; letter-spacing: .03em;
                  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .kpi-value {{ color: {p['value']}; font-size: 1.45rem; font-weight: 800; line-height: 1.25;
                  margin-top: 2px; white-space: nowrap; }}
    .kpi-sub {{ color: {p['good']}; font-size: 0.7rem; margin-top: 2px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .kpi.hero {{ background: linear-gradient(160deg, {p['hero_from']} 0%, {p['card']} 70%);
                 border-color: {p['hero_border']}; }}
    .kpi.hero .kpi-value {{ font-size: 2.1rem; }}
    .kpi.warn .kpi-sub {{ color: {p['warn']}; }}
    .kpi.bad .kpi-sub {{ color: {p['bad']}; }}
    .kpi.muted .kpi-sub {{ color: {p['label']}; }}
    .kpi.compact {{ padding: 10px 8px; }}
    .kpi.compact .kpi-value {{ font-size: 1.05rem; }}
    .stTabs [data-baseweb="tab-list"] {{ gap: 4px; }}
    .stTabs [data-baseweb="tab"] {{ padding: 0.45rem 0.6rem; font-size: 0.95rem; }}
    div.stButton > button, div.stLinkButton > a {{ min-height: 44px; border-radius: 12px; font-weight: 700; }}
    .note {{ color: {p['note']}; font-size: 0.72rem; }}
    </style>
    """, unsafe_allow_html=True)


def kpi_row(cards):
    """横並びのKPIカード。cards: [(label, value, sub, css_class), ...]

    st.columns はスマホ幅では縦積みになるため、1つのHTML flex行として描画する。
    """
    html = ["<div class='kpi-row'>"]
    for label, value, sub, cls in cards:
        html.append(
            f"<div class='kpi {cls}'><div class='kpi-label'>{label}</div>"
            f"<div class='kpi-value'>{value}</div><div class='kpi-sub'>{sub}</div></div>"
        )
    html.append("</div>")
    st.markdown("".join(html), unsafe_allow_html=True)


def yen(v):
    return "—" if v is None or (isinstance(v, float) and pd.isna(v)) else f"¥{int(v):,}"


def pct(v):
    return "—" if v is None else f"{v:.1f}%"


# ==========================================
# グラフ部品（スマホ幅向けに余白・高さを詰める）
# ==========================================
PLOTLY_CONFIG = {"displayModeBar": False, "responsive": True}


def _tight(fig, height, legend=True):
    fig.update_layout(
        height=height,
        margin=dict(l=8, r=8, t=28 if legend else 8, b=8),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        legend=dict(orientation="h", yanchor="bottom", y=1.0, xanchor="left", x=0, font=dict(size=11)),
        showlegend=legend,
    )
    return fig


def bar_ranking(df, label_col, p, top=10, key=None):
    """カテゴリ別 成功率の横棒ランキング（上から成功率の高い順）。"""
    d = df.head(top)
    fig = go.Figure(go.Bar(
        x=d["成功率"], y=d[label_col].astype(str), orientation="h",
        text=[f"{r:.1f}% ({n})" for r, n in zip(d["成功率"], d["試行数"])],
        textposition="outside", marker_color=p["accent"], cliponaxis=False,
    ))
    fig.update_yaxes(autorange="reversed", tickfont=dict(size=11))
    fig.update_xaxes(range=[0, 118], showticklabels=False, showgrid=False, zeroline=False)
    _tight(fig, max(150, 30 * len(d) + 30), legend=False)
    st.plotly_chart(fig, width="stretch", config=PLOTLY_CONFIG, key=key)


def bar_line(x, bars, line, bar_name, line_name, p, height=280, key=None, tickformat=None):
    """棒（件数）+ 折れ線（成功率%）の2軸グラフ。"""
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(go.Bar(x=x, y=bars, name=bar_name, marker_color=p["accent"], opacity=0.75), secondary_y=False)
    fig.add_trace(go.Scatter(x=x, y=line, name=line_name, mode="lines+markers",
                             line=dict(color=p["accent2"], width=3), marker=dict(size=6)), secondary_y=True)
    fig.update_yaxes(range=[0, 100], secondary_y=True, ticksuffix="%", tickfont=dict(size=10),
                     tickvals=[0, 25, 50, 75, 100], ticktext=["0%", "25%", "50%", "75%", "100%"], showgrid=False)
    fig.update_yaxes(tickfont=dict(size=10), secondary_y=False)
    fig.update_xaxes(tickfont=dict(size=10))
    if tickformat:
        fig.update_xaxes(tickformat=tickformat)
    _tight(fig, height)
    st.plotly_chart(fig, width="stretch", config=PLOTLY_CONFIG, key=key)


def rate_table(df, label_col, rows=None, key=None):
    """カテゴリ別の表。スマホ幅に収めるため 機種/試行/成功率 の3列に絞る（成功数は本家の表と同様に省く）。"""
    d = df if rows is None else df.head(rows)
    st.dataframe(
        d[[label_col, "試行数", "成功率"]], width="stretch", hide_index=True, key=key,
        column_config={
            label_col: st.column_config.TextColumn(label_col, width=150),
            "試行数": st.column_config.NumberColumn("試行", format="%d", width=60),
            "成功率": st.column_config.ProgressColumn("成功率", format="%.1f%%", min_value=0, max_value=100, width=130),
        },
    )


# ==========================================
# データ取得（10分キャッシュ。失敗時は例外にしてキャッシュさせない）
# ==========================================
@st.cache_data(ttl=600, show_spinner=False)
def load_frame(target_app):
    payload = analytics.fetch_payload(target_app)
    if payload is None or "analytics" not in payload:
        raise RuntimeError("APIに接続できませんでした（初回はサーバー起動に時間がかかります）。少し待ってから「更新」を押してください")
    terminals = analytics.terminal_map(payload)
    if not terminals and target_app == "original":
        terminals = analytics.terminal_map(analytics.fetch_payload("lite"))
    if target_app == "original":
        terminals.update(analytics.fetch_invite_id_map())
    df = analytics.build_frame(payload, target_app, terminals=terminals)
    return df, analytics.now_jst().strftime("%H:%M")


@st.cache_data(ttl=600, show_spinner=False)
def load_market_snapshots():
    return market.load_snapshots()


@st.cache_data(ttl=600, show_spinner=False)
def market_lookup(model_name):
    return market.lookup(model_name, load_market_snapshots())


# ==========================================
# 各タブ
# ==========================================
def render_today(summ, recent, preset, p):
    now = analytics.now_jst()
    today, yesterday = recent["today"], recent["yesterday"]

    if today:
        diff = today["成功数"] - (yesterday["成功数"] if yesterday else 0)
        sign = "+" if diff >= 0 else ""
        sub = f"試行 {today['試行数']} ・ 昨日比 {sign}{diff}台"
        cls = "hero" if diff >= 0 else "hero warn"
        kpi_row([(f"本日の成功数（{recent['today_label']}）", f"{today['成功数']}台", sub, cls)])
        kpi_row([
            ("本日の成功率", pct(today["成功率"]), "成功 ÷ 試行", ""),
            (f"昨日（{recent['yesterday_label']}）",
             f"{yesterday['成功数']}台" if yesterday else "—",
             pct(yesterday["成功率"]) if yesterday else "データなし", "muted"),
        ])
    else:
        kpi_row([(f"本日の成功数（{recent['today_label']}）", "—", "本日分のデータはまだありません", "hero muted")])
        if yesterday:
            kpi_row([(f"昨日（{recent['yesterday_label']}）", f"{yesterday['成功数']}台",
                      f"試行 {yesterday['試行数']} ・ {pct(yesterday['成功率'])}", "muted")])

    if now.hour >= 20:
        st.caption("🌙 20:00を過ぎたので、本日の運用データは確定しています。")
    else:
        st.caption("⏳ 本日分は 20:00 に確定します（それまでは途中経過）。")

    st.markdown(f"#### 📆 {preset}の実績")
    if not summ:
        st.info("この期間のデータがありません。期間を切り替えてみてください。")
        return
    kpi_row([
        ("総試行", f"{summ['total']:,}", f"{summ['days']}日分", "muted"),
        ("成功数", f"{summ['success']:,}", "台", "muted"),
        ("成功率", pct(summ["rate"]), "期間平均", ""),
    ])

    d = summ["daily"].tail(DAILY_CHART_MAX_DAYS)
    if len(summ["daily"]) > DAILY_CHART_MAX_DAYS:
        st.caption(f"直近{DAILY_CHART_MAX_DAYS}日分のみ表示")
    bar_line(d["日付"], d["成功数"], d["成功率"], "成功数", "成功率", p, key="today_daily",
             tickformat="%m/%d")


def render_results(summ, target_app, p):
    if not summ:
        st.info("この期間のデータがありません。")
        return

    st.markdown("#### 🎯 キャンペーン別 成功率")
    if summ["campaign"].empty:
        st.caption("データなし")
    else:
        bar_ranking(summ["campaign"], "招待種類", p, key="res_campaign")

    auth = summ["auth"]
    if len(auth) > 1 or target_app == "original":
        st.markdown("#### 🔐 認証方法別 成功率")
        if auth.empty:
            st.caption("データなし")
        else:
            bar_ranking(auth, "認証方法", p, key="res_auth")

    st.markdown("#### 📱 子端末ブランド別 成功率")
    if summ["brand"].empty:
        st.caption("データなし")
    else:
        bar_ranking(summ["brand"], "ブランド", p, key="res_brand")

    st.markdown("#### 📋 機種別（試行数順）")
    show_all = st.toggle("全機種を表示", value=False, key="res_model_all")
    rate_table(summ["model"], "機種", rows=None if show_all else MODEL_TABLE_ROWS, key="res_model_table")
    if not show_all and len(summ["model"]) > MODEL_TABLE_ROWS:
        st.caption(f"上位{MODEL_TABLE_ROWS}機種を表示（全{len(summ['model'])}機種）")


def render_parents(summ, p):
    if not summ:
        st.info("この期間のデータがありません。")
        return

    st.markdown("#### ⏳ 中日（前回招待からの日数）別 成功率")
    st.caption("親機を何日寝かせてから使うと成功しやすいか。")
    iv = summ["interval"]
    if iv.empty:
        st.caption("データなし")
    else:
        bar_line(iv["中日"], iv["試行数"], iv["成功率"], "試行数", "成功率", p, height=260, key="par_interval")

    st.markdown("#### 🏷️ 親機ブランド別 成功率")
    if summ["parent_brand"].empty:
        st.caption("データなし")
    else:
        bar_ranking(summ["parent_brand"], "親ブランド", p, key="par_brand")

    ptype = summ["parent_type"]
    if len(ptype) > 1:
        st.markdown("#### 🧬 親の種類別 成功率")
        bar_ranking(ptype, "親の種類", p, key="par_type")

    st.markdown("#### 🏆 親機 個体別（成功数順）")
    show_all = st.toggle("全親機を表示", value=False, key="par_all")
    par = summ["parent"]
    d = (par if show_all else par.head(PARENT_TABLE_ROWS)).copy()
    # スマホ幅に収めるため「成功/試行」を1列にまとめ、重要な列を左に寄せる（右側は横スクロール）
    d["成功/試行"] = d["成功数"].astype(str) + "/" + d["試行数"].astype(str)
    d = d[["親機ID", "成功/試行", "成功率", "親機種", "最終成功日"]]
    st.dataframe(
        d, width="stretch", hide_index=True, key="par_table",
        column_config={
            "親機ID": st.column_config.TextColumn("親機ID", width=70),
            "成功/試行": st.column_config.TextColumn("成功/試行", width=80),
            "成功率": st.column_config.ProgressColumn("成功率", format="%.1f%%", min_value=0, max_value=100, width=130),
            "親機種": st.column_config.TextColumn("機種", width=150),
            "最終成功日": st.column_config.TextColumn("最終成功", width=80),
        },
    )
    if not show_all and len(par) > PARENT_TABLE_ROWS:
        st.caption(f"上位{PARENT_TABLE_ROWS}台を表示（全{len(par)}台）")


def render_market(p):
    st.markdown("#### 💴 中古相場（イオシス）")
    if not market.available():
        st.info(
            "相場モジュール（iosys.py / kaitori.py / data_snapshots/）が見つかりません。"
            "本リポジトリのルートから起動するか、`mobile/` にそれらをコピーしてください。"
        )
        return

    models = market.list_models()
    pick = st.selectbox("機種を選ぶ", models, index=None, placeholder="タップして機種を選択…", key="mk_model")
    if not pick:
        st.caption("販売価格（今買うといくら）と買取価格（今売るといくら）を1機種ずつ確認できます。")
        return

    info = market_lookup(pick)
    sale, kt = info["sale"], info["kaitori"]

    st.markdown("**販売価格（イオシス）**")
    if sale["count"] == 0:
        st.caption("スナップショットに該当商品がありません。")
    else:
        kpi_row([
            ("中央値", yen(sale["median"]), f"{sale['count']}件", ""),
            ("最安", yen(sale["min"]), "税込", "muted"),
            ("最高", yen(sale["max"]), "税込", "muted"),
        ])
        br = sale["by_rank"]
        kpi_row([
            ("未使用", yen(br.get("未使用")), "最安", "muted compact"),
            ("Aランク", yen(br.get("Aランク")), "最安", "muted compact"),
            ("Bランク", yen(br.get("Bランク")), "最安", "muted compact"),
            ("Cランク", yen(br.get("Cランク")), "最安", "muted compact"),
        ])

    st.markdown("**買取価格（イオシス買取）**")
    if not kt:
        st.caption("買取価格表に該当がありません（BASIO・Libero・android one 等は表に無いことがあります）。")
    else:
        kpi_row([
            ("未使用 買取", yen(kt.get("unused_price")), f"{kt.get('matched_count', 0)}行を集約", ""),
            ("中古 上限", yen(kt.get("used_max")), "買取", "muted"),
            ("中古 下限", yen(kt.get("used_min")), "買取", "muted"),
        ])

    c1, c2 = st.columns(2)
    with c1:
        st.link_button("🔎 イオシスで検索", sale["search_url"], width="stretch")
    with c2:
        if kt and kt.get("page_url"):
            st.link_button("💴 買取価格表を開く", kt["page_url"], width="stretch")

    if sale["items"]:
        with st.expander(f"🔍 個別商品一覧（{sale['count']}件）", expanded=False):
            items_df = pd.DataFrame([
                {"商品名": it["name"], "ランク": it.get("rank"), "価格": it["price"], "URL": it.get("url")}
                for it in sale["items"]
            ]).sort_values("価格")
            st.dataframe(
                items_df, width="stretch", hide_index=True,
                column_config={
                    "価格": st.column_config.NumberColumn("税込", format="¥%d"),
                    "URL": st.column_config.LinkColumn("商品", display_text="開く"),
                },
            )

    snaps = load_market_snapshots()
    sale_at = (snaps.get("sale_fetched_at") or "")[:16].replace("T", " ")
    kt_at = (snaps.get("kaitori_fetched_at") or "")[:10]
    st.caption(f"出典: 販売＝イオシス（{sale_at or '取得日不明'} 時点）／買取＝イオシス買取（{kt_at or '取得日不明'} 時点）のスナップショット。価格は税込。")


# ==========================================
# メイン
# ==========================================
def main():
    p = palette()
    inject_css(p)

    st.markdown("<p class='m-title'>📱 Tik分析 モバイル</p>", unsafe_allow_html=True)

    app_label = st.segmented_control(
        "対象アプリ", list(APP_OPTIONS), default=DEFAULT_APP, key="app_mode", width="stretch",
    ) or DEFAULT_APP
    preset = st.segmented_control(
        "期間", list(analytics.PERIOD_PRESETS), default=DEFAULT_PERIOD, key="period", width="stretch",
    ) or DEFAULT_PERIOD
    target_app = APP_OPTIONS[app_label]

    if st.button("🔄 最新データに更新", width="stretch", key="refresh"):
        load_frame.clear()

    try:
        with st.spinner("データ取得中…（初回は30秒ほどかかることがあります）"):
            df, fetched_at = load_frame(target_app)
    except Exception as e:
        st.error(f"取得失敗: {e}")
        st.stop()

    rdf = analytics.filter_period(df, preset)
    summ = analytics.summarize(rdf)
    recent = analytics.recent_days(df)

    period_text = summ["period"] if summ else "データなし"
    st.markdown(
        f"<p class='m-sub'>{app_label}・{preset}（{period_text}）・{fetched_at} 取得</p>",
        unsafe_allow_html=True,
    )

    tabs = st.tabs(["🏠 今日", "📈 実績", "👑 親機", "💴 相場"])
    with tabs[0]:
        render_today(summ, recent, preset, p)
    with tabs[1]:
        render_results(summ, target_app, p)
    with tabs[2]:
        render_parents(summ, p)
    with tabs[3]:
        render_market(p)

    with st.expander("📲 ホーム画面に追加する（アプリのように開く）", expanded=False):
        st.markdown(
            "- **iPhone (Safari)**: 画面下の「共有」→「ホーム画面に追加」\n"
            "- **Android (Chrome)**: 右上の「⋮」→「ホーム画面に追加」\n\n"
            "追加後はアイコンをタップするだけで、このダッシュボードが全画面で開きます。"
        )
    st.caption(f"Tik分析アプリ モバイル v{VERSION}・データは10分間キャッシュ・本家PC版は別URL")


if __name__ == "__main__":
    main()
