"""
iosys.py — 株式会社イオシス（https://iosys.co.jp/）の中古スマホ販売価格を
検索・取得するためのユーティリティモジュール。

app.py の肥大化を避けるため、機種名の正規化・検索・フィルタリングのロジックを
このモジュールに切り出している。
"""
import random
import re
import time
import unicodedata
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://iosys.co.jp/items"
# UA未指定だと iosys.co.jp は 204 No Content を返して本文が空になることを確認済み。
# 一般的なブラウザUAを指定することで通常のHTML応答(200)が返る。
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 10
PAGE_SLEEP_SEC = 0.4

# 本番（Streamlit Cloud）で多数機種を一斉取得すると、HTTP 200のまま
# 0件応答が返る機種が出る（イオシス側の絞り込みとみられる）。
# リクエストを等間隔で撃たないよう、各リクエスト前に小さなランダムウェイトを入れる。
JITTER_MIN_SEC = 0.2
JITTER_MAX_SEC = 0.5


def _jitter_sleep():
    """リクエスト前のランダムウェイト（0.2〜0.5秒程度）。"""
    time.sleep(random.uniform(JITTER_MIN_SEC, JITTER_MAX_SEC))

# ローマ数字 → アラビア数字（Ⅳ→IV等の全角ローマ数字を半角英字表記へ変換）
_ROMAN_MAP = {
    "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV",
    "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅷ": "VIII",
    "Ⅸ": "IX", "Ⅹ": "X",
    "ⅰ": "i", "ⅱ": "ii", "ⅲ": "iii", "ⅳ": "iv",
    "ⅴ": "v", "ⅵ": "vi", "ⅶ": "vii", "ⅷ": "viii",
    "ⅸ": "ix", "ⅹ": "x",
}


def normalize_model_name(name: str) -> str:
    """機種名の表記ゆれを吸収する正規化。

    - ★等の装飾記号を除去
    - unicodedata.normalize("NFKC") で全角→半角統一
    - ローマ数字(Ⅳ等)を英字(IV等)に変換
    - 連続空白を1個に圧縮し、前後の空白をtrim
    """
    if name is None:
        return ""
    s = str(name)

    # 装飾記号（★☆■□●○◆◇▲△▼▽※・記号類）を除去
    s = re.sub(r"[★☆■□●○◆◇▲△▼▽※]", "", s)

    # 全角ローマ数字を先に半角英字へ変換（NFKCだとローマ数字は数字1文字に潰れてしまうため先に処理）
    for k, v in _ROMAN_MAP.items():
        s = s.replace(k, v)

    # 全角→半角などの正規化
    s = unicodedata.normalize("NFKC", s)

    # 連続空白の圧縮
    s = re.sub(r"\s+", " ", s)

    return s.strip()


def _parse_price(text: str):
    """'47,800' のような価格文字列をintへ。パースできなければNone。"""
    if not text:
        return None
    cleaned = re.sub(r"[^\d]", "", text)
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def _parse_items_page(html: str):
    """1ページ分のHTMLから商品リストをパースする。"""
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for li in soup.select("li.item"):
        form = li.find("form", id=re.compile(r"^form_"))
        if form is None:
            continue

        def _get_hidden(field_name):
            tag = form.find("input", attrs={"name": field_name})
            if tag is None:
                return ""
            return (tag.get("value") or "").strip()

        name = _get_hidden("name")
        rank = _get_hidden("rank")
        url_path = _get_hidden("url")
        if not name:
            continue

        price_p = li.select_one("div.price p")
        price = None
        if price_p is not None:
            # <p>47,800<span class="yen">円</span></p> の先頭テキストノードのみを使う
            first_text = price_p.find(text=True, recursive=False)
            price = _parse_price(first_text or price_p.get_text())

        url = url_path
        if url and not url.startswith("http"):
            url = "https://iosys.co.jp" + url

        items.append({
            "name": name,
            "price": price,
            "rank": rank,
            "url": url or "https://iosys.co.jp/items",
        })
    return items


def _get_total_count(html: str):
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.select_one("#total-item-text")
    if tag is None:
        return None
    try:
        return int(re.sub(r"[^\d]", "", tag.get_text()))
    except (TypeError, ValueError):
        return None


def search_iosys(keyword: str, max_pages: int = 2):
    """イオシスの商品検索を実行し、商品リストとエラーメッセージを返す。

    戻り値: (items: list[dict], error: str | None)
    """
    keyword = (keyword or "").strip()
    if not keyword:
        return [], "検索語が空です"

    all_items = []
    headers = {"User-Agent": USER_AGENT}

    try:
        for page in range(1, max_pages + 1):
            url = f"{BASE_URL}?q={quote(keyword)}"
            if page > 1:
                url += f"&page={page}"

            _jitter_sleep()
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            if resp.status_code != 200:
                if page == 1:
                    return [], f"イオシスへのアクセスに失敗しました（HTTP {resp.status_code}）"
                break

            page_items = _parse_items_page(resp.text)
            if page == 1 and not page_items:
                # 0件応答（total-item-textが0、または該当liなし）
                break

            all_items.extend(page_items)

            if not page_items:
                break

            if page < max_pages:
                time.sleep(PAGE_SLEEP_SEC)

        return all_items, None
    except requests.RequestException as e:
        return [], f"イオシスへの通信中にエラーが発生しました: {e}"
    except Exception as e:
        return [], f"検索処理中に予期しないエラーが発生しました: {e}"


# 「iPhone SE2」「iPhoneSE3」等の世代表記。イオシスの商品名は「【第3世代】 iPhoneSE ...」形式のため、
# 検索語・絞り込みとも「第n世代」へ読み替える必要がある
_SE_PATTERN = re.compile(r"^iphone\s*se\s*(\d)$", re.IGNORECASE)


def _split_alpha_digit(text: str):
    """英字と数字の間にスペースを入れる変種を作る（例: 'Xperia5' → 'Xperia 5'）。
    既にスペースがある箇所は変化しない。型番(SOG04等)まで過剰分割される可能性があるため、
    あくまでリトライ用の一案として使う。
    """
    # 英字→数字の境目、数字→英字の境目にスペースを挿入
    s = re.sub(r"(?<=[A-Za-z])(?=[0-9])", " ", text)
    s = re.sub(r"(?<=[0-9])(?=[A-Za-z])", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _first_two_tokens(text: str):
    tokens = text.split(" ")
    if len(tokens) <= 2:
        return text
    return " ".join(tokens[:2])


def search_with_fallback(model_name: str, max_pages: int = 2):
    """正規化した機種名で検索し、0件ならフォールバック候補を順に試す。

    戻り値: (items: list[dict], used_query: str, error: str | None)

    注意: used_query は「実際にヒットが得られた検索文字列」であり、
    英数字境界にスペースを入れた分割変種（例: "Xperia 5 IV"）が
    使われることがある。この分割変種は検索用であり、結果を
    filter_strict() で絞り込む際は used_query ではなく、必ず
    normalize_model_name(model_name)（= このモジュールが返す
    正規化済みの元機種名）を渡すこと。分割変種をそのまま渡すと
    トークンが細切れになり、無関係な型番まで一致してしまう
    （実測で確認済み: "AQUOS sense7"→"AQUOS sense 7"で検索した結果を
    "sense"単独トークンで絞ると"AQUOS sense3"等が混入する）。
    """
    normalized = normalize_model_name(model_name)
    if not normalized:
        return [], model_name, "機種名が空です"

    candidates = [normalized]

    se_match = _SE_PATTERN.match(normalized)
    if se_match:
        candidates.insert(0, f"iPhone SE 第{se_match.group(1)}世代")

    split_variant = _split_alpha_digit(normalized)
    if split_variant and split_variant != normalized:
        candidates.append(split_variant)

    two_token_variant = _first_two_tokens(normalized)
    if two_token_variant and two_token_variant not in candidates:
        candidates.append(two_token_variant)

    last_error = None
    for query in candidates:
        items, error = search_iosys(query, max_pages=max_pages)
        if error:
            last_error = error
            continue
        if items:
            return items, query, None

    # 全滅した場合は最後に試した（最初の正規化済み）クエリを返す
    return [], normalized, last_error


def filter_strict(items, query: str):
    """検索結果のうち、商品名に検索語の全トークンが
    （大文字小文字・スペース無視で）含まれるものだけに絞り込む。

    注意: query には「実際に検索に使った語」ではなく、常に正規化済みの
    元の機種名（分割変種を適用する前のもの）を渡すこと。
    _split_alpha_digit で英数字境界にスペースを入れた変種語をそのまま渡すと、
    「sense7」が「sense」「7」という別々のトークンに割れてしまい、
    "AQUOS sense7" のつもりが "AQUOS sense3" のような無関係な型番まで
    ヒットしてしまう（実測で確認済みの不具合）。
    そのため判定は「トークンごとのAND一致」ではなく、
    スペースを除去した連結文字列同士の部分文字列一致で行う
    （"aquossense7" が商品名の連結文字列に含まれるか）。
    """
    if not items:
        return []

    query_norm = normalize_model_name(query).lower()
    query_nospace = re.sub(r"\s+", "", query_norm)
    if not query_nospace:
        return items

    # iPhone SE系はイオシス側が「【第n世代】 iPhoneSE ...」表記のため、
    # 「iphonese」と「第n世代」の両方を含むかで判定する
    se_match = _SE_PATTERN.match(query_norm)

    filtered = []
    for item in items:
        name_norm = normalize_model_name(item.get("name", "")).lower()
        name_nospace = re.sub(r"\s+", "", name_norm)
        if se_match:
            if "iphonese" in name_nospace and f"第{se_match.group(1)}世代" in name_nospace:
                filtered.append(item)
        elif query_nospace in name_nospace:
            filtered.append(item)
    return filtered
