"""
test_kaitori.py — kaitori.py の機種名マッチング・価格パースのユニットテスト。

ネットワーク不要（実HTMLから採取したフィクスチャのみを使う）。
実行: python3 -m pytest test_kaitori.py -q  /  python3 test_kaitori.py
"""
import json
import os
import tempfile
from unittest import mock

import kaitori

# 実際の k-tai-iosys.com から採取した行名（2026-08-12取得）
AQUOS_ROWS = [
    "docomo版SIMフリー AQUOS sense7 SH-53C docomo版",
    "au版SIMフリー AQUOS sense7 SHG10 au版",
    "UQmobile版SIMフリー AQUOS sense7 SHG10 UQmobile版",
    "楽天版SIMフリー AQUOS sense7 SH-M24 楽天版",
    "国内版SIMフリー AQUOS sense7 SH-M24 国内版",
    "SoftBank版SIMフリー AQUOS sense7 plus A208SH SoftBank版",
    "docomo版SIMフリー AQUOS sense6 SH-54B docomo版",
    "docomo版SIMフリー AQUOS R11 SH-51G docomo版SIMフリー",
]

IPHONE_ROWS = [
    "docomo iPhone12 64GB",
    "au iPhone12 64GB",
    "SIMフリー iPhone12 128GB",
    "docomo iPhone12 mini 64GB",
    "docomo iPhone12 Pro 128GB",
    "docomo iPhone12 Pro Max 128GB",
    "docomo版SIMフリー iPhoneSE 第3世代 64GB",
    "Rakuten版 iPhoneSE 第3世代 64GB",
    "docomo版SIMフリー iPhoneSE 第2世代 64GB",
]


def _row(name, unused=10000, umax=8000, umin=5000, brand="aquos"):
    return {
        "name": name,
        "unused_price": unused,
        "used_max": umax,
        "used_min": umin,
        "brand": brand,
        "page_url": kaitori.brand_page_url(brand),
    }


def test_sense7_does_not_match_plus():
    """罠: AQUOS sense7 が AQUOS sense7 plus に誤マッチしてはいけない。"""
    assert kaitori.is_match("AQUOS sense7", "docomo版SIMフリー AQUOS sense7 SH-53C docomo版")
    assert kaitori.is_match("AQUOS sense7", "au版SIMフリー AQUOS sense7 SHG10 au版")
    assert not kaitori.is_match("AQUOS sense7", "SoftBank版SIMフリー AQUOS sense7 plus A208SH SoftBank版")


def test_sense7_plus_does_not_match_base():
    """逆方向: AQUOS sense7 plus が無印 sense7 に誤マッチしてはいけない。"""
    assert kaitori.is_match("AQUOS sense7 plus", "SoftBank版SIMフリー AQUOS sense7 plus A208SH SoftBank版")
    assert not kaitori.is_match("AQUOS sense7 plus", "docomo版SIMフリー AQUOS sense7 SH-53C docomo版")


def test_sense7_does_not_match_sense6():
    assert not kaitori.is_match("AQUOS sense7", "docomo版SIMフリー AQUOS sense6 SH-54B docomo版")


def test_iphone12_does_not_match_variants():
    """罠: iPhone 12 が mini / Pro / Pro Max に誤マッチしてはいけない。"""
    assert kaitori.is_match("iPhone 12", "docomo iPhone12 64GB")
    assert kaitori.is_match("iPhone 12", "SIMフリー iPhone12 128GB")
    assert not kaitori.is_match("iPhone 12", "docomo iPhone12 mini 64GB")
    assert not kaitori.is_match("iPhone 12", "docomo iPhone12 Pro 128GB")
    assert not kaitori.is_match("iPhone 12", "docomo iPhone12 Pro Max 128GB")


def test_iphone12_mini_matches_only_mini():
    assert kaitori.is_match("iPhone 12 mini", "docomo iPhone12 mini 64GB")
    assert not kaitori.is_match("iPhone 12 mini", "docomo iPhone12 64GB")
    assert not kaitori.is_match("iPhone 12 mini", "docomo iPhone12 Pro 128GB")


def test_iphone_se_generation_translation():
    """罠: iPhone SE2 / SE3 はイオシス表記「第n世代」への読み替えが必要。"""
    assert kaitori.is_match("iPhone SE3", "docomo版SIMフリー iPhoneSE 第3世代 64GB")
    assert kaitori.is_match("iPhone SE3", "Rakuten版 iPhoneSE 第3世代 64GB")
    assert not kaitori.is_match("iPhone SE3", "docomo版SIMフリー iPhoneSE 第2世代 64GB")
    assert kaitori.is_match("iPhone SE2", "docomo版SIMフリー iPhoneSE 第2世代 64GB")
    assert not kaitori.is_match("iPhone SE2", "docomo版SIMフリー iPhoneSE 第3世代 64GB")


def test_iphone12_does_not_match_se():
    assert not kaitori.is_match("iPhone 12", "docomo版SIMフリー iPhoneSE 第3世代 64GB")


def test_carrier_and_capacity_affixes_are_ignored():
    """付加語（キャリア版・容量・型番）は誤マッチ扱いにしない。"""
    for row_name in AQUOS_ROWS[:5]:
        assert kaitori.is_match("AQUOS sense7", row_name), row_name


def test_strip_affixes():
    assert kaitori.strip_affixes("docomo版SIMフリー AQUOS sense7 SH-53C docomo版") == "AQUOS sense7 SH-53C"
    assert kaitori.strip_affixes("docomo iPhone12 64GB") == "iPhone12"


def test_normalized_notation_variants():
    """内蔵リストの表記ゆれ（全角ローマ数字・スペース有無）が吸収されること。"""
    assert kaitori.is_match("Xperia5 Ⅳ", "docomo版SIMフリー Xperia 5 IV SO-54C docomo版")
    assert kaitori.is_match("Xperia 10 IV SO-52C", "docomo版SIMフリー Xperia 10 IV SO-52C docomo版")


def test_roman_generation_is_not_ignorable():
    """実データで発覚: 'Xperia1' が 'Xperia1 IV/V/VI/VII' に誤マッチしていた。
    世代のローマ数字は付加語ではなく別機種を意味する。
    """
    assert kaitori.is_match("Xperia1", "docomo Xperia1 SO-03L docomo版")
    assert not kaitori.is_match("Xperia1", "docomo版SIMフリー Xperia1 IV SO-51C docomo版")
    assert not kaitori.is_match("Xperia1", "au版SIMフリー Xperia1 VII SOG15 au版 12GB/256GB")
    assert kaitori.is_match("Xperia1 IV", "docomo版SIMフリー Xperia1 IV SO-51C docomo版")


def test_tokens_must_be_contiguous():
    """実データで発覚: 飛び飛び一致を許すと 'Xperia1' が 'Xperia XZ1' に、
    'Xperia5' が 'Xperia Z5' に誤マッチする。
    """
    assert not kaitori.is_match("Xperia1", "docomo Xperia XZ1 SO-01K docomo版")
    assert not kaitori.is_match("Xperia5", "docomo Xperia Z5 SO-01H docomo版")
    assert kaitori.is_match("Xperia5", "docomo Xperia5 SO-01M docomo版")


def test_plus_suffix_is_a_different_model():
    """実データで発覚: 'Galaxy S10' が 'Galaxy S10+' に誤マッチしていた。"""
    assert kaitori.is_match("Galaxy S10", "docomo Galaxy S10 SC-03L docomo版")
    assert not kaitori.is_match("Galaxy S10", "docomo Galaxy S10+ SC-04L docomo版")


def test_parse_price_cell_range():
    unused, umax, umin = kaitori.parse_price_cell(
        "未使用品買取価格 17,000円 中古買取価格 14,000円 ～ 9,000円"
    )
    assert (unused, umax, umin) == (17000, 14000, 9000)


def test_parse_price_cell_single_used_price():
    unused, umax, umin = kaitori.parse_price_cell("中古買取価格 5,000円")
    assert (unused, umax, umin) == (None, 5000, 5000)


def test_parse_price_cell_empty():
    assert kaitori.parse_price_cell("") == (None, None, None)


def test_parse_pricelist_html():
    html = """
    <table>
      <tr>
        <td>docomo版SIMフリー AQUOS sense7 SH-53C docomo版</td>
        <td>未使用品買取価格 17,000円 中古買取価格 14,000円 ～ 9,000円</td>
        <td>申込みはこちら</td>
      </tr>
      <tr>
        <td>見出し行</td><td>説明テキスト</td>
      </tr>
    </table>
    """
    rows = kaitori.parse_pricelist_html(html, "aquos")
    assert len(rows) == 1
    assert rows[0]["name"] == "docomo版SIMフリー AQUOS sense7 SH-53C docomo版"
    assert rows[0]["unused_price"] == 17000
    assert rows[0]["used_max"] == 14000
    assert rows[0]["used_min"] == 9000
    assert rows[0]["page_url"] == "https://k-tai-iosys.com/pricelist/smartphone/aquos/"


def test_aggregate_rows_takes_max_and_min():
    """複数行がマッチしたら 未使用=最大 / 中古上限=最大 / 中古下限=最小 に集約する。"""
    rows = [
        _row("A", unused=15000, umax=14000, umin=9000),
        _row("B", unused=17000, umax=13000, umin=8000),
        _row("C", unused=None, umax=12000, umin=10000),
    ]
    agg = kaitori.aggregate_rows(rows)
    assert agg["unused_price"] == 17000
    assert agg["used_max"] == 14000
    assert agg["used_min"] == 8000
    assert agg["matched_count"] == 3


def test_match_models_end_to_end():
    rows = [_row(n) for n in AQUOS_ROWS] + [_row(n, brand="iphone") for n in IPHONE_ROWS]
    result = kaitori.match_models(["AQUOS sense7", "iPhone 12", "存在しない機種XYZ"], rows)
    assert "AQUOS sense7" in result
    # plus と sense6 を除いた5行だけがマッチする
    assert result["AQUOS sense7"]["matched_count"] == 5
    assert "iPhone 12" in result
    # mini / Pro / Pro Max / SE を除いた3行
    assert result["iPhone 12"]["matched_count"] == 3
    assert "存在しない機種XYZ" not in result


def test_bundled_snapshot_is_loadable():
    """同梱スナップショットが実際に読め、マッチングに使える形であること。
    本番はこのファイルだけが買取価格の供給源になるため、壊れていたら即気づきたい。
    """
    rows, fetched_at = kaitori.load_snapshot()
    assert rows, "同梱スナップショットが読めない、または空です"
    assert fetched_at, "fetched_at が記録されていません"
    assert len(rows) > 1000, f"行数が少なすぎます: {len(rows)}"

    required = {"name", "unused_price", "used_max", "used_min", "brand", "page_url"}
    assert required.issubset(rows[0].keys())

    # スナップショット由来の行でも機種マッチングが成立する
    matched = kaitori.match_models(["AQUOS sense7", "iPhone 12"], rows)
    assert "AQUOS sense7" in matched
    assert matched["AQUOS sense7"]["used_max"] is not None
    assert "iPhone 12" in matched


def test_load_snapshot_missing_file_is_safe():
    """スナップショットが無くても例外を投げない（アプリは動き続けるべき）。"""
    rows, fetched_at = kaitori.load_snapshot("/nonexistent/path/snapshot.json")
    assert rows == []
    assert fetched_at is None


def test_fallback_uses_snapshot_when_live_fails():
    """本番の再現: 全ブランドが403で落ちたらスナップショットで補完される。"""
    with mock.patch.object(kaitori, "fetch_all_brands",
                           return_value=([], ["iphone: HTTP 403", "aquos: HTTP 403"])):
        rows, errors, meta = kaitori.fetch_all_brands_with_fallback()

    assert meta["used_snapshot"] is True
    assert meta["snapshot_fetched_at"]
    assert len(meta["snapshot_brands"]) == len(kaitori.BRANDS)
    assert rows, "スナップショットから1行も補完されていません"

    matched = kaitori.match_models(["AQUOS sense7"], rows)
    assert "AQUOS sense7" in matched


def test_fallback_prefers_live_when_available():
    """ライブで全ブランド取れた場合はスナップショットを使わない。"""
    live = [
        {"name": "docomo版SIMフリー AQUOS sense7 SH-53C docomo版",
         "unused_price": 1, "used_max": 1, "used_min": 1,
         "brand": b, "page_url": kaitori.brand_page_url(b)}
        for b in kaitori.BRANDS
    ]
    with mock.patch.object(kaitori, "fetch_all_brands", return_value=(live, [])):
        rows, errors, meta = kaitori.fetch_all_brands_with_fallback()

    assert meta["used_snapshot"] is False
    assert meta["snapshot_brands"] == []
    assert len(rows) == len(kaitori.BRANDS)


def test_fallback_fills_only_missing_brands():
    """一部ブランドだけ失敗した場合、そのブランドだけスナップショットで補う。"""
    live = [
        {"name": "docomo版SIMフリー AQUOS sense7 SH-53C docomo版",
         "unused_price": 1, "used_max": 1, "used_min": 1,
         "brand": "aquos", "page_url": kaitori.brand_page_url("aquos")}
    ]
    with mock.patch.object(kaitori, "fetch_all_brands",
                           return_value=(live, ["iphone: HTTP 403"])):
        rows, errors, meta = kaitori.fetch_all_brands_with_fallback()

    assert meta["used_snapshot"] is True
    assert "aquos" not in meta["snapshot_brands"], "ライブで取れたブランドを上書きしている"
    assert "iphone" in meta["snapshot_brands"]
    # ライブのaquos行はそのまま残る
    assert any(r["brand"] == "aquos" and r["unused_price"] == 1 for r in rows)


def test_snapshot_json_has_expected_shape():
    """同梱JSONのメタ情報が揃っていること（更新スクリプトの出力契約）。"""
    with open(kaitori.SNAPSHOT_PATH, encoding="utf-8") as f:
        data = json.load(f)
    for key in ("fetched_at", "source", "brands", "row_count", "rows"):
        assert key in data, f"{key} がスナップショットにありません"
    assert data["row_count"] == len(data["rows"])
    assert len(data["brands"]) == len(kaitori.BRANDS)


if __name__ == "__main__":
    import sys
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'OK' if failures == 0 else f'{failures} FAILED'}")
    sys.exit(1 if failures else 0)
