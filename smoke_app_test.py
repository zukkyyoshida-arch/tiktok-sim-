"""
smoke_app_test.py — streamlit.testing.v1.AppTest によるアプリ全体のスモークテスト。

中古相場タブの自動取得で113機種の実取得が走ると遅いため、
販売・買取の取得関数をモンキーパッチしてネットワークを叩かないようにする。

2026-08-13: 販売相場が同梱スナップショット方式になり、既定では
iosys.search_with_fallback を呼ばずに iosys.load_sale_snapshot() の内容を
表示するようになった（app.py の _load_sale_snapshot 経由）。そのため
このテストも search_with_fallback ではなく load_sale_snapshot をモックし、
スナップショット読取経路がネットワークを叩かないことを確認する。

実行: python3 smoke_app_test.py
"""
import sys
from unittest import mock

from streamlit.testing.v1 import AppTest

FAKE_SALE_SNAPSHOT = {
    "fetched_at": "2026-08-13T12:00:00+09:00",
    "results": {
        "AQUOS sense7": {
            "items": [
                {"name": "AQUOS sense7 SH-53C", "price": 19800, "rank": "Bランク",
                 "url": "https://iosys.co.jp/items/x"},
                {"name": "AQUOS sense7 SHG10", "price": 22800, "rank": "未使用",
                 "url": "https://iosys.co.jp/items/y"},
            ],
            "used_query": "AQUOS sense7",
        },
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

    # キャッシュ済み関数の実体を差し替える（ネットワーク遮断）。
    # 販売相場はスナップショット読取関数を、買取はフォールバック経路
    # （fetch_all_brands_with_fallback）のライブ取得側を空にして、
    # スナップショットが使われる状態を再現する。
    with mock.patch("iosys.load_sale_snapshot", return_value=FAKE_SALE_SNAPSHOT), \
         mock.patch("kaitori.fetch_all_brands", return_value=([], ["mocked: live取得なし"])):
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
