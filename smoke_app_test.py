"""
smoke_app_test.py — streamlit.testing.v1.AppTest によるアプリ全体のスモークテスト。

中古相場タブの自動取得で113機種の実取得が走ると遅いため、
販売・買取の取得関数をモンキーパッチしてネットワークを叩かないようにする。

実行: python3 smoke_app_test.py
"""
import sys
from unittest import mock

from streamlit.testing.v1 import AppTest

FAKE_SALE = {
    "AQUOS sense7": {
        "items": [
            {"name": "AQUOS sense7 SH-53C", "price": 19800, "rank": "Bランク",
             "url": "https://iosys.co.jp/items/x"},
            {"name": "AQUOS sense7 SHG10", "price": 22800, "rank": "未使用",
             "url": "https://iosys.co.jp/items/y"},
        ],
        "used_query": "AQUOS sense7",
        "error": None,
    },
}

FAKE_KAITORI = (
    {
        "AQUOS sense7": {
            "unused_price": 17000, "used_max": 14000, "used_min": 9000,
            "matched_count": 6, "brand": "aquos",
            "page_url": "https://k-tai-iosys.com/pricelist/smartphone/aquos/",
        }
    },
    [],
)


def main():
    at = AppTest.from_file("app.py", default_timeout=180)

    # キャッシュ済み関数の実体を差し替える（ネットワーク遮断）
    with mock.patch("iosys.search_with_fallback",
                    return_value=([FAKE_SALE["AQUOS sense7"]["items"][0]], "AQUOS sense7", None)), \
         mock.patch("kaitori.fetch_all_brands", return_value=([], [])):
        at.run()

    if at.exception:
        print("NG: 起動時に例外が発生しました")
        for e in at.exception:
            print("  ", e.message)
        return 1

    print("OK: アプリが例外なく起動しました")
    print(f"   タブ数: {len(at.tabs)}")
    print(f"   エラー表示: {len(at.error)} 件")
    if at.error:
        for e in at.error:
            print("   error:", e.value)
    return 0


if __name__ == "__main__":
    sys.exit(main())
