#!/usr/bin/env bash
# =============================================================================
# tools/tailscale_security_check.sh
#
# Tailscale「Tailworm」(2026-10-25 公開、CVE 未割当) 対策の点検・緩和スクリプト。
#   - 既定は **読み取り専用の点検** のみ。設定は一切変更しない。
#   - --disable-ssh        : Tailscale SSH サーバーを停止する (tailscale set --ssh=false)
#   - --disable-forwarding : Tailscale SSH のポート/Unix ソケット転送を無効化する
#                            (tailscaled の環境変数 TS_SSH_DISABLE_FORWARDING=1 を設定)
#   - --yes                : 対話確認を省略する
#
# 使い方:
#   bash tools/tailscale_security_check.sh                 # 点検のみ
#   sudo bash tools/tailscale_security_check.sh --disable-forwarding
#   sudo bash tools/tailscale_security_check.sh --disable-ssh
#
# 終了コード: 0 = 問題なし / 1 = 要対応あり / 2 = tailscale が見つからない等
#
# 詳細: docs/tailscale_tailworm_2026-10.md
# =============================================================================
set -u

LATEST_KNOWN_VERSION="1.104.2"   # 2026-10-26 時点の最新安定版（Tailworm の修正は未収録）
FIXED_VERSION=""                 # 公式 Security Bulletin で修正版が出たらここを更新する

DO_DISABLE_SSH=0
DO_DISABLE_FWD=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --disable-ssh)        DO_DISABLE_SSH=1 ;;
    --disable-forwarding) DO_DISABLE_FWD=1 ;;
    --yes|-y)             ASSUME_YES=1 ;;
    -h|--help)
      sed -n '3,19p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "不明なオプション: $arg" >&2; exit 2 ;;
  esac
done

N_OK=0; N_WARN=0; N_NG=0
ok()   { N_OK=$((N_OK+1));     printf '  [OK]     %s\n' "$*"; }
warn() { N_WARN=$((N_WARN+1)); printf '  [注意]   %s\n' "$*"; }
ng()   { N_NG=$((N_NG+1));     printf '  [要対応] %s\n' "$*"; }
info() {                       printf '  [情報]   %s\n' "$*"; }
section() { printf '\n== %s ==\n' "$*"; }

# --- tailscale CLI の探索 ------------------------------------------------------
TS=""
for cand in \
  "$(command -v tailscale 2>/dev/null || true)" \
  /opt/homebrew/bin/tailscale \
  /usr/local/bin/tailscale \
  /usr/bin/tailscale \
  /Applications/Tailscale.app/Contents/MacOS/Tailscale ; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then TS="$cand"; break; fi
done

OS="$(uname -s)"
section "環境"
info "OS: $OS"
if [ -z "$TS" ]; then
  echo "  tailscale CLI が見つかりません。Tailscale 未導入ならこの端末は Tailworm の影響を受けません。" >&2
  exit 2
fi
info "tailscale CLI: $TS"

MAC_GUI=0
case "$TS" in
  /Applications/Tailscale.app/*) MAC_GUI=1 ;;
esac

# --- バージョン ------------------------------------------------------------------
section "バージョン"
VER_RAW="$("$TS" version 2>/dev/null | head -n1 || true)"
VER="${VER_RAW%%-*}"
if [ -z "$VER" ]; then
  warn "tailscale version を取得できませんでした（tailscaled が停止中の可能性）"
else
  info "インストール版: $VER"
  if [ -n "$FIXED_VERSION" ]; then
    if [ "$(printf '%s\n%s\n' "$FIXED_VERSION" "$VER" | sort -V | head -n1)" = "$FIXED_VERSION" ]; then
      ok "修正版 $FIXED_VERSION 以上です"
    else
      ng "修正版 $FIXED_VERSION 未満です。今すぐ更新してください (tailscale update)"
    fi
  else
    if [ "$(printf '%s\n%s\n' "$LATEST_KNOWN_VERSION" "$VER" | sort -V | head -n1)" = "$LATEST_KNOWN_VERSION" ]; then
      info "最新安定版 ($LATEST_KNOWN_VERSION) 以上ですが、Tailworm の修正はまだどの版にも含まれていません (2026-10-26 時点)"
    else
      warn "最新安定版 $LATEST_KNOWN_VERSION より古い版です。修正版が出たとき即時適用できるよう、先に最新へ更新しておいてください"
    fi
    info "修正版が公開されたら https://tailscale.com/security-bulletins を確認し、本スクリプトの FIXED_VERSION を更新してください"
  fi
fi

# --- prefs の取得 ---------------------------------------------------------------
section "ノード設定 (tailscale debug prefs)"
PREFS_JSON="$("$TS" debug prefs 2>/dev/null || true)"
RUN_SSH=""; RUN_WEB=""; SHIELDS=""; ADV_ROUTES=""; APP_CONN=""; AUTO_APPLY=""; EXIT_NODE_ADV=""
if [ -n "$PREFS_JSON" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PARSED="$(printf '%s' "$PREFS_JSON" | python3 -I -c '
import json, sys
p = json.load(sys.stdin)
def b(v): return "1" if v else "0"
routes = p.get("AdvertiseRoutes") or []
print("RUN_SSH=" + b(p.get("RunSSH")))
print("RUN_WEB=" + b(p.get("RunWebClient")))
print("SHIELDS=" + b(p.get("ShieldsUp")))
print("ADV_ROUTES=" + str(len(routes)))
print("EXIT_NODE_ADV=" + b(any(r in ("0.0.0.0/0", "::/0") for r in routes)))
print("APP_CONN=" + b((p.get("AppConnector") or {}).get("Advertise")))
au = p.get("AutoUpdate") or {}
print("AUTO_APPLY=" + b(au.get("Apply") in (True, "true")))
' 2>/dev/null || true)"
    eval "$PARSED"
  fi
  if [ -z "${RUN_SSH:-}" ]; then
    # python3 が無い / 失敗した環境向けの簡易判定
    printf '%s' "$PREFS_JSON" | grep -q '"RunSSH":true'       && RUN_SSH=1 || RUN_SSH=0
    printf '%s' "$PREFS_JSON" | grep -q '"RunWebClient":true' && RUN_WEB=1 || RUN_WEB=0
    printf '%s' "$PREFS_JSON" | grep -q '"ShieldsUp":true'    && SHIELDS=1 || SHIELDS=0
    printf '%s' "$PREFS_JSON" | grep -q '"Advertise":true'    && APP_CONN=1 || APP_CONN=0
  fi
fi

if [ -z "${RUN_SSH:-}" ]; then
  warn "設定を取得できませんでした（権限不足の可能性。sudo で再実行してください）"
else
  if [ "$RUN_SSH" = "1" ]; then
    ng "Tailscale SSH サーバーが有効です。Tailworm の主要経路です。不要なら --disable-ssh、必要なら --disable-forwarding を適用してください"
  else
    ok "Tailscale SSH サーバーは無効です（Tailworm の主要経路は閉じています）"
  fi
  if [ "${APP_CONN:-0}" = "1" ]; then
    warn "App connector を広告しています。不要なら tailscale set --advertise-connector=false"
  else
    ok "App connector は無効です"
  fi
  if [ "${RUN_WEB:-0}" = "1" ]; then
    warn "Web 管理画面 (port 5252) が有効です。不要なら tailscale set --webclient=false"
  else
    ok "Web 管理画面は無効です"
  fi
  if [ -n "${ADV_ROUTES:-}" ] && [ "${ADV_ROUTES}" != "0" ]; then
    info "サブネット経路を ${ADV_ROUTES} 件広告しています（必要なら維持。不要なら tailscale set --advertise-routes=）"
  fi
  if [ "${EXIT_NODE_ADV:-0}" = "1" ]; then
    info "Exit node として広告しています（必要なら維持）"
  fi
  if [ "${SHIELDS:-0}" = "1" ]; then
    ok "Shields Up（着信全拒否）が有効です"
  else
    info "この端末が他ノードから接続される必要が無いなら tailscale set --shields-up=true も有効です"
  fi
  if [ -n "${AUTO_APPLY:-}" ]; then
    if [ "$AUTO_APPLY" = "1" ]; then
      ok "自動更新が有効です（修正版が出れば自動適用されます）"
    else
      warn "自動更新が無効です。修正版の即時適用のため tailscale set --auto-update=true を推奨（対応プラットフォームのみ）"
    fi
  fi
fi

# --- serve / funnel --------------------------------------------------------------
section "tailscale serve / funnel"
SERVE_JSON="$("$TS" serve status --json 2>/dev/null || true)"
if [ -z "$SERVE_JSON" ] || [ "$SERVE_JSON" = "{}" ] || [ "$SERVE_JSON" = "null" ]; then
  ok "serve / funnel の公開設定はありません"
else
  if printf '%s' "$SERVE_JSON" | grep -Eq 'unix:|tailscaled\.sock|docker\.sock'; then
    ng "serve が Unix ソケットを公開しています（tailscaled.sock 公開は LocalAPI 乗っ取り = ノード乗っ取りに直結）。tailscale serve reset を検討してください"
  else
    info "serve の公開設定があります。内容を確認してください: $TS serve status"
  fi
  if printf '%s' "$SERVE_JSON" | grep -Eq '"AllowFunnel"\s*:\s*\{[^}]*true'; then
    warn "Funnel（インターネット公開）が有効です。不要なら tailscale funnel reset"
  fi
fi

# --- SSH 転送のキルスイッチ ------------------------------------------------------
section "Tailscale SSH の転送キルスイッチ (TS_SSH_DISABLE_FORWARDING)"
ENV_FILE=""
RESTART_CMD=""
case "$OS" in
  Linux)
    ENV_FILE="/etc/default/tailscaled"
    RESTART_CMD="sudo systemctl restart tailscaled"
    ;;
  Darwin)
    if [ "$MAC_GUI" = "1" ]; then
      info "macOS GUI 版 (App Store / Standalone) は Tailscale SSH サーバーを動かせないため、この項目は対象外です"
    else
      ENV_FILE="/etc/tailscale/tailscaled-env.txt"
      RESTART_CMD="sudo brew services restart tailscale   # もしくは tailscaled を再起動"
    fi
    ;;
esac

FWD_DISABLED=0
if [ -n "$ENV_FILE" ]; then
  if [ -r "$ENV_FILE" ] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?TS_SSH_DISABLE_FORWARDING=(1|true)' "$ENV_FILE"; then
    FWD_DISABLED=1
  fi
  if [ "$OS" = "Linux" ] && [ "$(id -u)" = "0" ]; then
    PID="$(pidof tailscaled 2>/dev/null | awk '{print $1}')"
    if [ -n "$PID" ] && [ -r "/proc/$PID/environ" ]; then
      if tr '\0' '\n' < "/proc/$PID/environ" | grep -Eq '^TS_SSH_DISABLE_FORWARDING=(1|true)$'; then
        FWD_DISABLED=1
        info "稼働中の tailscaled (pid $PID) に TS_SSH_DISABLE_FORWARDING が設定済みです"
      elif [ "$FWD_DISABLED" = "1" ]; then
        warn "$ENV_FILE には設定済みですが、稼働中の tailscaled には未反映です。再起動してください: $RESTART_CMD"
      fi
    fi
  fi
  if [ -z "${RUN_SSH:-}" ]; then
    if [ "$FWD_DISABLED" = "1" ]; then
      ok "SSH 転送キルスイッチは設定済みです（TS_SSH_DISABLE_FORWARDING）"
    else
      warn "SSH サーバーの有効/無効を判定できませんでした。sudo で再実行するか、保険として --disable-forwarding を適用してください"
    fi
  elif [ "$RUN_SSH" = "1" ]; then
    if [ "$FWD_DISABLED" = "1" ]; then
      ok "SSH 転送は無効化済みです（TS_SSH_DISABLE_FORWARDING）"
    else
      ng "SSH 転送が有効のままです。Tailscale SSH を使い続けるなら --disable-forwarding を適用してください"
    fi
  else
    if [ "$FWD_DISABLED" = "1" ]; then
      ok "SSH 転送キルスイッチも設定済みです（SSH を再有効化しても転送は閉じたまま）"
    else
      info "SSH サーバーが無効なので必須ではありませんが、保険として --disable-forwarding を入れておくと安全です"
    fi
  fi
fi

# --- 緩和の適用 ---------------------------------------------------------------------
confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  printf '%s [yes/NO]: ' "$1"
  read -r ans
  [ "$ans" = "yes" ]
}

if [ "$DO_DISABLE_FWD" = "1" ]; then
  section "適用: SSH 転送の無効化"
  if [ -z "$ENV_FILE" ]; then
    info "この環境では対象外です（GUI 版 macOS など）"
  elif [ "$FWD_DISABLED" = "1" ]; then
    info "既に設定済みです"
  else
    if [ "$(id -u)" != "0" ]; then
      echo "  $ENV_FILE へ書き込むため sudo で再実行してください" >&2
    else
      mkdir -p "$(dirname "$ENV_FILE")"
      printf '\n# Tailworm (2026-10) 緩和: Tailscale SSH のポート/Unix ソケット転送を無効化\nTS_SSH_DISABLE_FORWARDING=1\n' >> "$ENV_FILE"
      echo "  $ENV_FILE に TS_SSH_DISABLE_FORWARDING=1 を追記しました"
      echo "  反映には tailscaled の再起動が必要です（数秒間 tailnet が切れます）: $RESTART_CMD"
      FWD_DISABLED=1
    fi
  fi
fi

if [ "$DO_DISABLE_SSH" = "1" ]; then
  section "適用: Tailscale SSH サーバーの停止"
  if [ "${RUN_SSH:-0}" != "1" ]; then
    info "既に無効です"
  else
    echo "  !! 実行前に、Tailscale SSH 以外の入口（OS の sshd + 公開鍵、物理アクセス、コンソール等）が使えることを必ず確認してください"
    if confirm "  Tailscale SSH を停止しますか？ (yes と入力)"; then
      if "$TS" set --ssh=false; then
        echo "  Tailscale SSH サーバーを停止しました"
        RUN_SSH=0
      else
        echo "  失敗しました。sudo で再実行するか、tailscale set --operator=\$USER を設定してください" >&2
      fi
    else
      info "中止しました"
    fi
  fi
fi

# --- まとめ ---------------------------------------------------------------------------
section "まとめ"
printf '  OK: %d / 注意: %d / 要対応: %d\n' "$N_OK" "$N_WARN" "$N_NG"
echo "  tailnet 側の ACL（ssh ルールの絞り込み・root 禁止・check モード）は管理コンソールで確認してください。"
echo "  手順: docs/tailscale_tailworm_2026-10.md"
if [ "$N_NG" -gt 0 ]; then exit 1; fi
exit 0
