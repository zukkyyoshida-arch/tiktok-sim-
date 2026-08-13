# tiktok-sim-

TikTok運用分析のStreamlitアプリ「Tik分析アプリ」。

本番はStreamlit Cloud（mainブランチへのpushで自動デプロイ・反映まで1〜2分）。

## 構成

- `app.py` — アプリ本体。7タブ構成
  （🏠 ダッシュボード / 📊 実績分析 / 👑 親機分析 / 🧬 相性・疲弊度分析 /
  🔄 稼働シミュレーション / 💴 中古相場 / ⚙️ 設定）
- `iosys.py` — イオシス（iosys.co.jp）の中古スマホ**販売**価格スクレイパー。
  UA未指定だと204が返るため、UA指定が必須。`BUILTIN_MODEL_LIST`（運用端末の機種リスト）も
  ここに定義（`tools/update_iosys_snapshot.py` がstreamlit抜きで参照するため）
- `kaitori.py` — イオシス**買取**（k-tai-iosys.com）の買取価格表の取得・パース・
  機種名マッチング。streamlit非依存
- `tools/update_kaitori_snapshot.py` — 買取スナップショットの更新スクリプト
- `tools/update_iosys_snapshot.py` — 販売相場スナップショットの更新スクリプト
- `data_snapshots/` — 買取スナップショット（`kaitori_snapshot.json`）と
  販売相場スナップショット（`iosys_sale_snapshot.json`）を同梱

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

## 販売相場スナップショットの運用（2026-08-13〜）

中古相場タブは、買取価格と同じ「同梱スナップショット方式」で販売価格（イオシス販売）も
即時表示する。既定では `data_snapshots/iosys_sale_snapshot.json` を表示し、
タブの「🔄 相場を再取得」を押したときだけライブ取得に切り替わる（同一セッション中は
ライブ結果を優先）。

更新:

```bash
python3 tools/update_iosys_snapshot.py           # 全機種
python3 tools/update_iosys_snapshot.py --limit 5 # 動作確認用（先頭5機種のみ）
```

差分を確認してコミットする:

```bash
git diff --stat data_snapshots/iosys_sale_snapshot.json
git add data_snapshots/iosys_sale_snapshot.json
git commit -m "chore: 販売相場スナップショットを更新"
```

## 注記

- `Antigravty/` は本アプリと無関係な別アプリ群。同名の `app.py` を含むため
  編集時は対象フォルダを取り違えないこと
- `scratch/` は使い捨てスクリプト置き場。git管理外（.gitignoreで除外）
