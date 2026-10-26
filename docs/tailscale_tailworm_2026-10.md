# Tailscale「Tailworm」脆弱性への対策手順（2026-10-26 時点）

## 1. 何が起きているか

- 2026-10-25、Cyberdione Labs の研究者 Erica Windisch 氏が **「Tailworm」** と題して
  Tailscale クライアント **1.104.2**（2026-10-21 公開の最新安定版）と自己ホスト用コントロール
  サーバー **headscale 0.29.5** に関する **11 件の所見** を公開した。
- **CVE は未割当。修正版も未公開**。Tailscale は VP of Engineering（Mike Shaver 氏）が
  Reddit 上で「報告を受け取り修正作業中。外部の専門家とも同領域を点検していた」と表明しているが、
  11 件すべてを個別に認めたわけではない。公式 Security Bulletin にはまだ掲載されていない。
- 研究者はベンダーへ PoC を送ったとしているが、修正を待たずに公開したため「調整なし開示」として
  議論になっている。**第三者による再現は未確認**。
- Streamlit Cloud 側や本リポジトリのコードは Tailscale を使っていないため **アプリ自体は無関係**。
  対象は **Tailscale を入れている運用機（M1 サーバー、作業用 Mac/PC など）** と、tailnet の
  ACL 設定。

### 主な所見（影響が大きい順）

| # | 内容 | 前提条件 | 影響 |
|---|------|----------|------|
| 1 | **Tailscale SSH の Unix ソケット転送**（`ssh -L/-R` の unix: 転送）が root 権限で動く。許可ディレクトリの制限を rename レースで回避できる | 攻撃者が **tailnet 内の承認済み端末を既に掌握**していて、SSH ルールで対象ノードへ到達できること。対象ノードで Tailscale SSH が有効なこと | `docker.sock` / `/run/systemd/private` / `tailscaled.sock` へ root で到達 → 対象ノードの root 奪取 → さらに別ノードへ横展開 |
| 2 | `tailscale serve` で `tailscaled.sock` を公開していると、peer から **LocalAPI を読み書き**できる | serve で Unix ソケットを公開している | ノード乗っ取り |
| 3 | App connector の経路制御、LocalAPI 露出、HTTP/2 認可、DoS、DERP 関連 | 構成依存 | 中〜低 |
| 4 | headscale: 攻撃者が新規登録キーを発行し、信頼された偽ノードを追加できる | headscale を自己ホストしている | tailnet 全体の信頼侵害 |

ポイント: **インターネットから直接突かれる RCE ではなく、1 台侵入された後の「横展開・権限昇格」**。
ただし Tailscale SSH を有効にした Linux サーバーが複数台ある構成では致命的になりうる。

## 2. まず 5 分でやること（影響判定）

Tailscale を入れている **各端末** で:

```bash
# このリポジトリ同梱の点検スクリプト（読み取り専用。設定は変えない）
bash tools/tailscale_security_check.sh
```

スクリプトが無い端末では手動で:

```bash
tailscale version                        # 1.104.2 が 2026-10-26 時点の最新。修正版はまだ無い
tailscale debug prefs | grep -E '"RunSSH"|"RunWebClient"|"Advertise"'
tailscale serve status                   # unix: や tailscaled.sock の公開が無いか
tailscale funnel status
```

判定:

- `"RunSSH":false` かつ serve に Unix ソケット公開なし → **その端末は主要経路の対象外**。
  自動更新をオンにして修正版を待つだけでよい。
- `"RunSSH":true` → 次章の対策を **今日中に** 実施。
- macOS の **App Store 版 / Standalone (.pkg) 版** は Tailscale SSH サーバーを動かせないため、
  所見 1 の対象外。Homebrew 等の `tailscaled` 版のみ対象。

## 3. 緊急対策（修正版が出るまで）

優先度順。上から順に、該当するものだけ実施する。

### 3-1. Tailscale SSH が不要な端末では止める（最も確実）

```bash
# 事前に: OS 標準の sshd + 公開鍵、物理アクセス、クラウドコンソール等、別の入口があることを確認
sudo tailscale set --ssh=false
# もしくは
sudo bash tools/tailscale_security_check.sh --disable-ssh
```

### 3-2. Tailscale SSH を使い続ける端末では「転送」を殺す

Tailworm の所見 1 は **ポート/Unix ソケット転送**を使う。tailscaled には転送だけを無効化する
スイッチ（環境変数 `TS_SSH_DISABLE_FORWARDING=1`）がある（1.104.2 の
`ssh/tailssh/tailssh.go` で確認済み。ACL の許可より優先して転送を拒否する）。
通常のシェルログインや `tailscale ssh` は使える。

```bash
# Linux (systemd)
echo 'TS_SSH_DISABLE_FORWARDING=1' | sudo tee -a /etc/default/tailscaled
sudo systemctl restart tailscaled

# macOS (Homebrew 等の tailscaled 版)
sudo mkdir -p /etc/tailscale
echo 'TS_SSH_DISABLE_FORWARDING=1' | sudo tee -a /etc/tailscale/tailscaled-env.txt
sudo brew services restart tailscale

# 上記をまとめて行う場合
sudo bash tools/tailscale_security_check.sh --disable-forwarding
```

再起動中は数秒間 tailnet が切れる。Tailscale 経由で作業中なら切断に備えること。

### 3-3. tailnet の ACL（管理コンソール → Access controls）で SSH ルールを絞る

<https://login.tailscale.com/admin/acls> のポリシーファイル `"ssh"` セクションを見直す。

- `"users"` から **`"root"` を外す**（`autogroup:nonroot` のみにする）
- `src` / `dst` を **必要な端末・タグの組だけ**にする。`autogroup:member` → `tag:server` のような
  広いルールは分割する
- `"action": "accept"` を **`"check"`** にして、接続時にブラウザ再認証を要求する
  （既定 12 時間。`checkPeriod` で調整）
- 使っていない SSH ルールは削除する

最小構成の例（自分の端末にだけ、非 root で、再認証付き）:

```jsonc
"ssh": [
  {
    "action":      "check",
    "checkPeriod": "12h",
    "src":         ["autogroup:member"],
    "dst":         ["autogroup:self"],
    "users":       ["autogroup:nonroot"]
  }
]
```

M1 サーバーへ特定の端末からだけ入る例:

```jsonc
"tagOwners": { "tag:m1server": ["autogroup:admin"] },
"ssh": [
  {
    "action":      "check",
    "src":         ["user@example.com"],      // 自分のアカウントに置き換える
    "dst":         ["tag:m1server"],
    "users":       ["autogroup:nonroot"]
  }
]
```

### 3-4. serve / funnel / App connector の棚卸し

```bash
tailscale serve status        # unix:... や tailscaled.sock があれば即削除
tailscale serve reset         # 全部要らないなら
tailscale funnel reset        # インターネット公開が不要なら
sudo tailscale set --advertise-connector=false   # App connector が不要なら
sudo tailscale set --webclient=false             # Web 管理画面(5252)が不要なら
```

### 3-5. 侵入の起点を減らす（一般論だが今回は特に効く）

- 「1 台侵入される」が前提条件なので、**使っていない端末・期限切れ端末を tailnet から削除**する
  （管理コンソール → Machines）。
- 他ノードから接続される必要が無い端末（作業用 PC など）は `sudo tailscale set --shields-up=true`。
- 自動更新を有効化し、修正版が出たら即座に当たるようにする:
  `sudo tailscale set --auto-update=true`（Linux / Windows / macOS Standalone が対象。
  App Store 版は App Store 側の自動更新を使う）。
- headscale を自己ホストしている場合は 0.29.5 に修正は無い。登録キーの発行権限を見直し、
  headscale の更新を監視する。

## 4. 修正版が出たら

1. <https://tailscale.com/security-bulletins> に Tailworm 関連の bulletin（TS-2026-0xx）が
   載り、修正版が明記される。
2. 全端末を更新（`sudo tailscale update` または自動更新）。
3. `tools/tailscale_security_check.sh` の `FIXED_VERSION` を修正版に書き換えて、
   更新漏れの端末を検出できるようにする。
4. 転送キルスイッチ（3-2）は、業務上 `-L/-R` が必要でなければ **そのまま残す** のが安全。

## 5. 参照

- The Hacker News: Unpatched Tailscale SSH Flaws Could Let a Hacked Device Reach Root on Other Servers
  <https://thehackernews.com/2026/10/unpatched-tailscale-ssh-flaws-could-let.html>
- Brandefense: Tailworm: Tailscale Flaws and Who Is Exposed
  <https://brandefense.io/security-news/tailworm-tailscale-vulnerabilities-who-is-exposed/>
- pwn.watch: Tailworm: researcher drops 11 unpatched Tailscale and headscale flaws
  <https://pwn.watch/i/tailscale-tailworm-ssh-forwarding-privesc>
- セキュリティ対策Lab（日本語）: Tailscale SSHなどに11件の問題を指摘「Tailworm」
  <https://rocket-boys.co.jp/security-measures-lab/tailscale_tailworm_11_ssh_headscale_findings_20261026>
- 研究者の一次報告: <https://www.tailworm.com/>
- Tailscale Security Bulletins（修正版はここに出る）: <https://tailscale.com/security-bulletins>
- Tailscale SSH ドキュメント: <https://tailscale.com/kb/1193/tailscale-ssh>
- 転送キルスイッチの根拠（ソース）: `ssh/tailssh/tailssh.go` の `TS_SSH_DISABLE_FORWARDING`
  <https://github.com/tailscale/tailscale/blob/v1.104.2/ssh/tailssh/tailssh.go>
- 環境変数ファイルの置き場所（ソース）: `envknob/envknob.go` の `ApplyDiskConfig`
  <https://github.com/tailscale/tailscale/blob/v1.104.2/envknob/envknob.go>
