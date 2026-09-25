# Tik分析アプリ モバイル版（`mobile/`）

スマホで「今日どうだった？」「この機種いくら？」をサッと確認するための、
Tik分析アプリの軽量ダッシュボードです。本家 `../app.py`（PC向け・8タブ）と
**同じ GAS データ**を、縦画面・片手操作向けに絞り込んで表示します。

| タブ | 内容 |
| --- | --- |
| 🏠 今日 | 本日の成功数・成功率（昨日比）、期間の総試行/成功/成功率、日次トレンド |
| 📈 実績 | キャンペーン別・認証方法別・ブランド別の成功率、機種別の表 |
| 👑 親機 | 中日（寝かせ日数）別 成功率、親機ブランド別・親の種類別、親機 個体別ランキング |
| 💴 相場 | 機種を1つ選んで、イオシスの販売価格（中央値/最安/ランク別）と買取価格を表示 |

設計方針:

- 縦1カラム・大きめのタップ領域・横スクロール無し（`layout="centered"`、サイドバー不使用）
- 期間は「7日 / 28日 / 今月 / 先月」のワンタップ切替
- 自動リフレッシュは行わない（電池・通信量の節約）。データは10分キャッシュ + 「🔄 最新データに更新」
- 端末のライト/ダーク設定に追従（本家のように背景を黒に固定しない）
- 中古相場は同梱スナップショット（`../data_snapshots/`）のみを読み、ライブ取得はしない

## 構成

- `app.py` — 画面（Streamlit）。本家と同名だが別物なので編集時に取り違えないこと
- `analytics.py` — GAS からの取得・整形・集計（streamlit非依存。本家 `fetch_data_logic` の移植）
- `market.py` — 中古相場の1機種ルックアップ（本家の `iosys.py` / `kaitori.py` を再利用）
- `sample_data.py` — ネットワーク無しで動かすためのダミーデータ生成（テスト・画面確認用）
- `test_analytics.py` — 単体テスト（pytest）
- `smoke_test.py` — アプリ全体の起動確認（`streamlit.testing`。通信はダミーに差し替え）
- `demo.py` — ダミーデータで画面を確認するための起動ラッパー
- `requirements.txt` — 依存（ルートの `requirements.txt` の部分集合。ルートのものでも動く）
- `.streamlit/config.toml` — ダークテーマ設定（`cd mobile` して起動したとき／単独リポジトリ化したときのみ有効）

## ローカル起動

リポジトリのルートから:

```bash
pip install -r requirements.txt
streamlit run mobile/app.py
```

ダミーデータで画面だけ確認したいとき（GAS に接続しない）:

```bash
streamlit run mobile/demo.py
```

スマホで実機確認するときは、PCと同じWi-Fiにつないで `http://<PCのIP>:8501` を開く
（`streamlit run mobile/app.py --server.address 0.0.0.0`）。

## テスト

```bash
pip install -r requirements-dev.txt
python3 -m pytest mobile/test_analytics.py
python3 mobile/smoke_test.py
```

## Streamlit Cloud へのデプロイ（本家とは別アプリとして）

本家PC版と同じリポジトリから、メインファイルだけ変えて**2つ目のアプリ**を作ります。
本家の URL には影響しません。

1. https://share.streamlit.io → **New app**
2. Repository: `zukkyyoshida-arch/tiktok-sim-`、Branch: `main`
3. **Main file path: `mobile/app.py`**
4. App URL は分かりやすい名前（例: `tik-mobile`）にして **Deploy**

以降は `main` への push で本家と同様に自動再デプロイされます。
依存は `mobile/requirements.txt`（無ければルートの `requirements.txt`）が使われます。

### スマホのホーム画面に追加

デプロイした URL をスマホで開いて:

- **iPhone (Safari)**: 画面下の「共有」→「ホーム画面に追加」
- **Android (Chrome)**: 右上の「⋮」→「ホーム画面に追加」

以降はアイコンをタップするだけで、アプリのように全画面で開きます
（アプリ内の一番下にも同じ案内を置いています）。

## 単独リポジトリに分けたい場合

`mobile/` は自己完結するように作ってあるので、次のファイルをコピーするだけで
別リポジトリとして動きます（相場タブに必要な3つも一緒に持っていく）:

```
mobile/*                 → 新リポジトリのルートへ（app.py, analytics.py, market.py, ...）
iosys.py, kaitori.py     → 新リポジトリのルートへ（相場タブ用）
data_snapshots/          → 新リポジトリのルートへ（相場タブ用スナップショット）
```

ただしスナップショットは本リポジトリ側で M1 の月次ジョブが更新しているため、
分けると相場が古くなりやすい点に注意。**同じリポジトリから `mobile/app.py` を
メインファイルにしてデプロイする方法（上記）を推奨**します。
