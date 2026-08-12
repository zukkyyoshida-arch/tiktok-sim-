# tiktok-sim-

TikTok運用分析のStreamlitアプリ「Tik分析アプリ」。

本番はStreamlit Cloud（mainブランチへのpushで自動デプロイ・反映まで1〜2分）。

## 構成

- `app.py` — アプリ本体。7タブ構成
  （🏠 ダッシュボード / 📊 実績分析 / 👑 親機分析 / 🧬 相性・疲弊度分析 /
  🔄 稼働シミュレーション / 💴 中古相場 / ⚙️ 設定）
- `iosys.py` — イオシス（iosys.co.jp）の中古スマホ**販売**価格スクレイパー。
  UA未指定だと204が返るため、UA指定が必須
- `kaitori.py` — イオシス**買取**（k-tai-iosys.com）の買取価格表の取得・パース・
  機種名マッチング。streamlit非依存
- `tools/update_kaitori_snapshot.py` — 買取スナップショットの更新スクリプト
- `data_snapshots/` — 買取スナップショット（`kaitori_snapshot.json`）を同梱

## 起動方法

```bash
pip install -r requirements.txt
streamlit run app.py
```

## テスト

```bash
pip install -r requirements-dev.txt
python3 -m pytest test_kaitori.py
```

スモークテスト（アプリ全体の起動確認）:

```bash
python3 smoke_app_test.py
```

## 買取スナップショットの運用（重要）

本番のStreamlit CloudはAWSのIPで通信するため、k-tai-iosys.com に403で弾かれる。
そのため買取価格は `data_snapshots/kaitori_snapshot.json` が実質唯一の供給源。

更新は**自宅など住宅IPの一般回線**から以下を実行し、差分を確認してコミットする:

```bash
python3 tools/update_kaitori_snapshot.py
```

M1サーバーの月次自動ジョブでも更新される（2026-08-12設置）。

## 注記

- `Antigravty/` は本アプリと無関係な別アプリ群。同名の `app.py` を含むため
  編集時は対象フォルダを取り違えないこと
- `scratch/` は使い捨てスクリプト置き場。git管理外（.gitignoreで除外）
