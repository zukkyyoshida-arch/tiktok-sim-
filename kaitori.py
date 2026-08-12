"""
kaitori.py — イオシス買取（https://k-tai-iosys.com/）の買取価格表を
取得・パース・機種名マッチングするためのユーティリティモジュール。

販売価格（iosys.py）が「今買うといくら」なのに対し、こちらは
「今売るといくら」を扱う。買取の検索ページはJS描画で静的取得できないが、
ブランド別の買取価格表ページ（/pricelist/smartphone/<brand>/）は
静的HTMLで配信されているため、そちらを取得してパースする。

このモジュールは streamlit に依存しない（キャッシュは呼び出し側の責務）。
"""
import json
import os
import random
import re
import time
import unicodedata

import requests
from bs4 import BeautifulSoup

from iosys import normalize_model_name

# 同梱スナップショットの場所。本番（Streamlit Cloud）はAWSのIPから通信するため
# k-tai-iosys.com に全ブランド403で弾かれる。住宅IPで取得したこのファイルを
# フォールバックに使う（更新は tools/update_kaitori_snapshot.py）。
SNAPSHOT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "data_snapshots", "kaitori_snapshot.json"
)

BASE_URL = "https://k-tai-iosys.com/pricelist/smartphone"
# iosys.co.jp 本体と同様、UA未指定だと弾かれる可能性があるためブラウザUAを指定する
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15
PAGE_SLEEP_SEC = 0.4

# 通信例外・429・5xx発生時のリトライ設定（1回だけ）。
# 403はリトライしない（本番のAWS IPで恒常的に出る想定内の応答のため。即諦めてスナップショットに任せる）。
RETRY_BACKOFF_MIN_SEC = 1.5
RETRY_BACKOFF_MAX_SEC = 3.0


def _is_retryable_status(status_code: int) -> bool:
    """リトライ対象のHTTPステータスか（429・5xxのみ。403は対象外）。"""
    return status_code == 429 or 500 <= status_code < 600

# 買取価格表が存在するブランドのスラッグ（2026-08-12時点で全て200応答・パース可能を実測確認）
BRANDS = [
    "iphone", "xperia", "galaxy", "pixel", "arrows", "zenfone",
    "motorola", "aquos", "huawei", "xiaomi", "oppo", "simfree", "rakuten",
]


def brand_page_url(brand: str) -> str:
    """ブランドの買取価格表ページのURL。"""
    return f"{BASE_URL}/{brand}/"


# 行の機種名セルの先頭に付くキャリア・販路の接頭辞。
# 実データ例: 'docomo版SIMフリー AQUOS sense7 SH-53C docomo版' のように
# 先頭と末尾の両方に付くことがあるため、前後とも剥がす。
_CARRIER_WORDS = [
    "docomo", "au", "softbank", "SoftBank", "Softbank", "ymobile", "Ymobile",
    "YMobile", "uqmobile", "UQmobile", "UQ mobile", "rakuten", "Rakuten", "楽天",
    "国内", "海外", "香港", "米国", "北米", "アメリカ", "中国", "台湾", "韓国", "欧州",
]
_CARRIER_ALT = "|".join(sorted((re.escape(w) for w in _CARRIER_WORDS), key=len, reverse=True))

# 「docomo版SIMフリー」「SIMロック解除」「SIMフリー」「au版」等をまとめて剥がすパターン
_AFFIX_PATTERN = re.compile(
    r"(?:(?:%s)\s*版?\s*(?:SIMフリー|SIMロック解除)?|SIMフリー|SIMロック解除|版)" % _CARRIER_ALT,
    re.IGNORECASE,
)

# 容量表記（64GB・1TB・12GB/512GB 等）
_CAPACITY_PATTERN = re.compile(r"\b\d+\s*(?:GB|TB)\b(?:\s*/\s*\d+\s*(?:GB|TB)\b)?", re.IGNORECASE)

# 価格セルのパターン
_UNUSED_PATTERN = re.compile(r"未使用品買取価格\s*([\d,]+)\s*円")
_USED_RANGE_PATTERN = re.compile(r"中古買取価格\s*([\d,]+)\s*円\s*[～~]\s*([\d,]+)\s*円")
_USED_SINGLE_PATTERN = re.compile(r"中古買取価格\s*([\d,]+)\s*円")

# iosys.py と同じ「iPhone SE2 → 第2世代」の読み替え規則
_SE_PATTERN = re.compile(r"^iphone\s*se\s*(\d)$", re.IGNORECASE)


def _parse_price(text):
    """'17,000' のような価格文字列をintへ。パースできなければNone。"""
    if not text:
        return None
    cleaned = re.sub(r"[^\d]", "", str(text))
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def parse_price_cell(text: str):
    """価格セルのテキストから (未使用買取, 中古買取上限, 中古買取下限) を取り出す。

    実データ例:
        '未使用品買取価格 17,000円 中古買取価格 14,000円 ～ 9,000円'
    中古価格が範囲でなく単価のみの行もあるため、その場合は上限=下限とする。
    """
    if not text:
        return None, None, None
    s = unicodedata.normalize("NFKC", str(text))

    unused = None
    m = _UNUSED_PATTERN.search(s)
    if m:
        unused = _parse_price(m.group(1))

    used_max = used_min = None
    m = _USED_RANGE_PATTERN.search(s)
    if m:
        used_max = _parse_price(m.group(1))
        used_min = _parse_price(m.group(2))
    else:
        m = _USED_SINGLE_PATTERN.search(s)
        if m:
            used_max = used_min = _parse_price(m.group(1))

    return unused, used_max, used_min


def parse_pricelist_html(html: str, brand: str):
    """ブランド買取価格表ページのHTMLから買取行のリストを返す。

    戻り値: list[dict]
        {"name": 行の機種名, "unused_price": int|None,
         "used_max": int|None, "used_min": int|None,
         "brand": str, "page_url": str}
    """
    soup = BeautifulSoup(html, "html.parser")
    page_url = brand_page_url(brand)
    rows = []
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        name = re.sub(r"\s+", " ", cells[0].get_text(" ", strip=True)).strip()
        price_text = cells[1].get_text(" ", strip=True)
        if not name or "買取価格" not in price_text:
            continue

        unused, used_max, used_min = parse_price_cell(price_text)
        if unused is None and used_max is None:
            continue

        rows.append({
            "name": name,
            "unused_price": unused,
            "used_max": used_max,
            "used_min": used_min,
            "brand": brand,
            "page_url": page_url,
        })
    return rows


def _get_with_retry(url, headers, timeout):
    """requests.get を実行し、通信例外または429/5xx応答の場合のみ1回だけ再試行する。

    403はリトライ対象外（本番のAWS IPで恒常的に出る想定内の応答のため）。
    2回目も失敗した場合は、例外はそのまま送出し、429/5xx応答はそのままResponseを返す
    （呼び出し側の既存のステータスコード判定に委ねる）。
    """
    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
    except requests.RequestException:
        time.sleep(random.uniform(RETRY_BACKOFF_MIN_SEC, RETRY_BACKOFF_MAX_SEC))
        return requests.get(url, headers=headers, timeout=timeout)

    if _is_retryable_status(resp.status_code):
        time.sleep(random.uniform(RETRY_BACKOFF_MIN_SEC, RETRY_BACKOFF_MAX_SEC))
        resp = requests.get(url, headers=headers, timeout=timeout)

    return resp


def fetch_brand(brand: str):
    """1ブランドの買取価格表を取得してパースする。

    戻り値: (rows: list[dict], error: str | None)
    """
    url = brand_page_url(brand)
    try:
        resp = _get_with_retry(url, {"User-Agent": USER_AGENT}, REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return [], f"{brand}: 買取価格表の取得に失敗しました（HTTP {resp.status_code}）"
        rows = parse_pricelist_html(resp.text, brand)
        if not rows:
            return [], f"{brand}: 買取価格表から価格行を読み取れませんでした"
        return rows, None
    except requests.RequestException as e:
        return [], f"{brand}: 買取サイトへの通信中にエラーが発生しました: {e}"
    except Exception as e:
        return [], f"{brand}: 買取価格表の解析中に予期しないエラーが発生しました: {e}"


def fetch_all_brands(brands=None):
    """全ブランドの買取価格表を取得する。

    1ブランドが失敗しても他を巻き添えにせず、失敗はerrorsに積んで返す。

    戻り値: (rows: list[dict], errors: list[str])
    """
    if brands is None:
        brands = BRANDS

    all_rows = []
    errors = []
    for i, brand in enumerate(brands):
        rows, error = fetch_brand(brand)
        if error:
            errors.append(error)
        all_rows.extend(rows)
        if i < len(brands) - 1:
            time.sleep(PAGE_SLEEP_SEC)
    return all_rows, errors


# ==========================================
# 機種名マッチング
# ==========================================

def strip_affixes(name: str) -> str:
    """買取行の機種名から、キャリア・販路・容量の付加語を取り除く。

    例: 'docomo版SIMフリー AQUOS sense7 SH-53C docomo版' → 'AQUOS sense7 SH-53C'
    """
    s = normalize_model_name(name)
    s = _CAPACITY_PATTERN.sub(" ", s)
    s = _AFFIX_PATTERN.sub(" ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# 型番トークン（SH-53C・SOG04・A208SH・SC-41A・SH-M24 等）。
# 英字と数字が混在し、ハイフンを含みうる語を1つの型番として扱う。
# 'sense7' のような機種名の一部を巻き込まないよう、
# 大文字始まりの英字ブロック＋数字という型番らしい形に限定する。
_MODEL_CODE_TOKEN = re.compile(
    r"(?<![0-9A-Za-z])(?:"
    # ハイフン付き型番: SH-53C / SH-M24 / SC-41A / SO-52C
    r"[A-Z]{2,}-[A-Z]?[0-9]{2,}[A-Z]{0,2}"
    # ハイフン無し型番: SOG04 / SCG18 / A208SH / A001SO / J9260
    r"|[A-Z]{2,}[0-9]{2,}[A-Z]{0,2}"
    r"|[A-Z]{1,2}[0-9]{3,}[A-Z]{0,2}"
    r")(?![0-9A-Za-z])"
)


def strip_model_codes(name: str) -> str:
    """機種名から型番（SH-53C・A208SH 等）を取り除く。

    型番は買取行にだけ付く付加語であり、トークン比較の際に
    'sh' '53' 'c' のような断片へ割れて誤判定の原因になるため、
    比較前にまとめて落としておく。
    """
    s = _MODEL_CODE_TOKEN.sub(" ", name)
    return re.sub(r"\s+", " ", s).strip()


def _tokenize(text: str):
    """比較用のトークン列。英字と数字の境目で分割し、小文字化する。

    'AQUOS sense7' → ['aquos', 'sense', '7']
    'iPhone12 Pro Max' → ['iphone', '12', 'pro', 'max']

    英数字境界で必ず割ることで、'sense7' と 'sense 7' のような
    表記ゆれを吸収しつつ、'7' と '7 plus' の違いは保持できる。
    """
    s = normalize_model_name(text).lower()
    # 買取サイトは 'iPhoneSE' 'iPhone12' のようにブランド名を詰めて書くため、
    # 'iphone' の直後を必ず割ってトークン境界を揃える
    s = re.sub(r"iphone(?=[0-9a-z])", "iphone ", s)
    # 'Galaxy S10+' の '+' は系列を分ける意味を持つため、語として残す
    s = re.sub(r"\+", " plus ", s)
    # 記号（ハイフン・スラッシュ等）は区切りにするが、型番は英数字のまとまりとして残す
    s = re.sub(r"[^0-9a-z぀-ヿ一-鿿]+", " ", s)
    # 日本語（かな・漢字）と英数字の境目を割る（'iphonese第3世代' → 'iphonese 第 3 世代'）
    s = re.sub(r"(?<=[0-9a-z])(?=[぀-ヿ一-鿿])", " ", s)
    s = re.sub(r"(?<=[぀-ヿ一-鿿])(?=[0-9a-z])", " ", s)
    # 日本語トークン同士も1文字ずつではなく、数字を挟んで割れるようにする
    s = re.sub(r"(?<=[぀-ヿ一-鿿])(?=[぀-ヿ一-鿿])", "", s)
    # 英字と数字の境目を割る（'sense7' → 'sense 7'）
    s = re.sub(r"(?<=[a-z])(?=[0-9])", " ", s)
    s = re.sub(r"(?<=[0-9])(?=[a-z])", " ", s)
    return [t for t in s.split(" ") if t]


# 型番らしきトークン（SH-53C・SOG04・A208SH・SC-41A 等）。
# 買取行にだけ付く付加語であり、これが余っていても誤マッチ扱いにしない。
_MODEL_CODE_RE = re.compile(r"^(?=.*\d)(?=.*[a-z])[a-z0-9]{4,}$")

# 機種の系列を分ける意味を持つ語。買取行側にこれらが余っている場合は
# 別機種なので、誤マッチとして弾く（'AQUOS sense7' vs 'AQUOS sense7 plus' 等）。
_VARIANT_WORDS = {
    "plus", "pro", "max", "mini", "ultra", "lite", "basic", "premium",
    "compact", "active", "play", "power", "fold", "flip", "note", "edge",
    "se", "5g", "4g", "s", "e", "c", "a", "t", "g", "x",
}

# 世代を表すローマ数字（Xperia1 と Xperia1 IV は別機種）。
# これらが買取行側に余っている場合は、無印機種の一致とみなしてはいけない。
_ROMAN_GENERATION = {
    "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
}


def _is_extra_token_ok(token: str) -> bool:
    """買取行側にだけ現れた余剰トークンが、無視してよい付加語かどうか。

    型番・世代表記・キャリア残りは無視してよい。
    plus / pro / mini のような系列語が余っている場合は別機種なので無視できない。
    """
    if token in _VARIANT_WORDS:
        return False
    if token in _ROMAN_GENERATION:
        return False
    if _MODEL_CODE_RE.match(token):
        return True
    # 「第3世代」等の分解後トークン、単独の記号的な語
    if token in {"世代", "第", "版", "国内", "海外", "香港", "楽天", "sim", "フリー", "ロック", "解除"}:
        return True
    # 純粋な数字が余るのは容量や世代の残骸だが、機種番号の可能性もあるため許容しない
    if token.isdigit():
        return False
    # 短い英字トークン（キャリア名の残り等）は許容
    if len(token) <= 3 and token.isalpha():
        return True
    return _MODEL_CODE_RE.match(token) is not None


def _canonical_query_tokens(model_name: str):
    """検索側（BUILTIN_MODEL_LIST）の機種名をトークン化する。

    iPhone SE2 / SE3 は買取サイト表記の「iPhoneSE 第n世代」に読み替える。
    """
    normalized = normalize_model_name(model_name)
    se_match = _SE_PATTERN.match(normalized)
    if se_match:
        return ["iphone", "se", "第", se_match.group(1), "世代"], True
    # 内蔵リスト側にも型番付きの表記（'Xperia 10 IV SO-52C' 等）があるため、
    # 買取行側と同じ基準で型番を落としてから比較する
    return _tokenize(strip_model_codes(normalized)), False


def is_match(model_name: str, row_name: str) -> bool:
    """内蔵リストの機種名と、買取行の機種名が同一機種を指すかを判定する。

    判定の考え方:
      1. 双方をトークン列にする（英数字境界で分割するため sense7 == sense 7）
      2. 検索側の全トークンが、買取行側に順序どおり現れること
      3. 買取行側に余ったトークンが「無視してよい付加語」だけであること
         （型番・キャリア・容量はOK。plus / Pro / mini 等の系列語はNG）

    これにより次の誤マッチを防ぐ:
      - 'AQUOS sense7' が 'AQUOS sense7 plus' に一致しない
      - 'iPhone 12' が 'iPhone 12 mini / Pro / Pro Max' に一致しない
      - 逆に 'AQUOS sense7 plus' は 'AQUOS sense7' に一致しない（トークン不足）
    """
    query_tokens, is_se = _canonical_query_tokens(model_name)
    if not query_tokens:
        return False

    stripped = strip_model_codes(strip_affixes(row_name))
    row_tokens = _tokenize(stripped)
    if is_se:
        # SE系は世代表記が命。付加語剥がしで世代が消えないよう元の行名から取り直す
        row_tokens = _tokenize(_CAPACITY_PATTERN.sub(" ", normalize_model_name(row_name)))
    if not row_tokens:
        return False

    if is_se:
        # 世代が一致していれば、他に何が付いていても同一機種とみなす
        return _find_contiguous(row_tokens, query_tokens) >= 0

    # 検索側トークンは「連続した並び」として現れなければならない。
    # 飛び飛びの一致を許すと 'Xperia1' が 'Xperia XZ1' に、
    # 'Xperia5' が 'Xperia Z5' に一致してしまう（実データで確認済み）。
    start = _find_contiguous(row_tokens, query_tokens)
    if start < 0:
        return False

    # 一致部分の外に残ったトークンを検査する
    end = start + len(query_tokens)
    for j, token in enumerate(row_tokens):
        if start <= j < end:
            continue
        if not _is_extra_token_ok(token):
            return False
    return True


def _find_contiguous(haystack, needle):
    """haystack の中で needle が連続して現れる開始位置。無ければ -1。"""
    if not needle or len(needle) > len(haystack):
        return -1
    for i in range(len(haystack) - len(needle) + 1):
        if haystack[i:i + len(needle)] == needle:
            return i
    return -1


def aggregate_rows(rows):
    """同一機種にマッチした複数行（キャリア版・容量違い）を代表値へ集約する。

    未使用 = 最大値 / 中古上限 = 最大値 / 中古下限 = 最小値
    """
    unused_values = [r["unused_price"] for r in rows if r.get("unused_price") is not None]
    max_values = [r["used_max"] for r in rows if r.get("used_max") is not None]
    min_values = [r["used_min"] for r in rows if r.get("used_min") is not None]

    return {
        "unused_price": max(unused_values) if unused_values else None,
        "used_max": max(max_values) if max_values else None,
        "used_min": min(min_values) if min_values else None,
        "matched_count": len(rows),
        "page_url": rows[0]["page_url"] if rows else None,
        "brand": rows[0]["brand"] if rows else None,
    }


def load_snapshot(path=None):
    """同梱の買取スナップショットを読み込む。

    戻り値: (rows: list[dict], fetched_at: str | None)
        読めない場合は ([], None)。スナップショットが無くてもアプリは動くべきなので、
        例外は投げずに空で返す。
    """
    path = path or SNAPSHOT_PATH
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return [], None

    rows = data.get("rows") or []
    if not isinstance(rows, list):
        return [], None
    return rows, data.get("fetched_at")


def fetch_all_brands_with_fallback(brands=None, snapshot_path=None):
    """ライブ取得を試み、失敗したブランドをスナップショットで補完する。

    本番環境では全ブランドが403になるため、実質スナップショットのみで動く。
    ローカル（住宅IP）では全ブランドがライブで取れるため、スナップショットは使われない。

    戻り値: (rows, errors, meta)
        meta = {
            "live_brands": ライブで取得できたブランド,
            "snapshot_brands": スナップショットで補完したブランド,
            "snapshot_fetched_at": スナップショットの取得日時（補完した場合のみ）,
            "used_snapshot": スナップショットを1件でも使ったか,
        }
    """
    live_rows, errors = fetch_all_brands(brands)
    live_brands = sorted({r["brand"] for r in live_rows})

    target_brands = list(brands) if brands is not None else list(BRANDS)
    missing = [b for b in target_brands if b not in set(live_brands)]

    meta = {
        "live_brands": live_brands,
        "snapshot_brands": [],
        "snapshot_fetched_at": None,
        "used_snapshot": False,
    }

    if not missing:
        return live_rows, errors, meta

    snapshot_rows, fetched_at = load_snapshot(snapshot_path)
    if not snapshot_rows:
        # スナップショットも無ければライブ分だけ返す（買取列は空になる）
        return live_rows, errors, meta

    missing_set = set(missing)
    filled = [r for r in snapshot_rows if r.get("brand") in missing_set]
    if not filled:
        return live_rows, errors, meta

    meta["snapshot_brands"] = sorted({r["brand"] for r in filled})
    meta["snapshot_fetched_at"] = fetched_at
    meta["used_snapshot"] = True

    return live_rows + filled, errors, meta


def match_models(model_names, rows):
    """機種名リストと買取行リストを突き合わせ、機種ごとの代表値を返す。

    戻り値: dict[機種名, 集約結果dict]
        マッチしなかった機種はキー自体を作らない（呼び出し側でNone扱い）。
    """
    result = {}
    for model_name in model_names:
        matched = [r for r in rows if is_match(model_name, r["name"])]
        if matched:
            result[model_name] = aggregate_rows(matched)
    return result
