"""
test_analytics.py — モバイル版の集計ロジック（analytics.py / market.py）の単体テスト。

実行: python3 -m pytest mobile/test_analytics.py
ネットワークは使わない（sample_data.make_payload のダミーデータのみ）。
"""
import os
import sys
from datetime import datetime

import pandas as pd
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import analytics  # noqa: E402
import market  # noqa: E402
import sample_data  # noqa: E402

NOW = datetime(2026, 9, 25, 15, 0, 0)


@pytest.fixture
def lite_frame():
    payload = sample_data.make_payload("lite", days=40, per_day=6, now=NOW)
    return analytics.build_frame(payload, "lite", terminals=analytics.terminal_map(payload), now=NOW)


# ---------- 列解決 ----------
def test_resolve_columns_lite_by_name():
    cols = analytics.resolve_columns(sample_data.HEADERS["lite"], "lite")
    assert cols["f"] == 1 and cols["j"] == 3 and cols["n"] == 7 and cols["q"] == 8
    assert cols["auth"] == 4            # lite は「招待方法」
    assert cols["date1"] == 5
    assert cols["date2"] == 6           # 「Tik開始」より後ろの最初の「時刻」
    assert cols["parent_type"] == 9


def test_resolve_columns_original_by_name():
    cols = analytics.resolve_columns(sample_data.HEADERS["original"], "original")
    assert cols["auth"] == 3            # original は「子認証方法」
    assert cols["parent_type"] is None


def test_resolve_columns_returns_none_without_header():
    assert analytics.resolve_columns(["10時", "成功", "C001", "AQUOS"], "lite") is None
    assert analytics.resolve_columns([], "lite") is None


# ---------- 整形 ----------
def test_build_frame_basic(lite_frame):
    df = lite_frame
    assert list(df.columns) == analytics.FRAME_COLUMNS
    assert len(df) == 41 * 6 + 1                   # ノイズ行は除外。未来行は残る（filter_period で除外）
    assert df["is_success"].dtype == bool
    assert set(df["auth_method"].unique()) <= {"Google", "LINE", "未設定"}   # 「〜認証」が取れている
    assert set(df["parent_model"].unique()) <= {m for _, m in sample_data.PARENTS}
    assert analytics.filter_period(df, "28日", now=NOW)["date"].max() <= pd.Timestamp(NOW)


def test_build_frame_drops_noise_and_keeps_future_for_period_filter():
    payload = sample_data.make_payload("lite", days=2, per_day=1, now=NOW)
    df = analytics.build_frame(payload, "lite", now=NOW)
    # 4桁数字の招待種類はノイズとして落ちる
    assert "2024" not in set(df["invite_type"])
    # 未来行は build_frame では残り（日付は有効）、filter_period で落ちる
    assert (df["date"] > pd.Timestamp(NOW)).sum() == 1
    assert (analytics.filter_period(df, "28日", now=NOW)["date"] > pd.Timestamp(NOW)).sum() == 0


def test_build_frame_parent_id_rules():
    header = sample_data.HEADERS["lite"]
    rows = [header,
            ["9時", "成功", "C1", "AQUOS sense7", "LINE認証", "2026-09-20T00:00:00.000Z", "", "1234.0", "ブタ5000", "", "", "", ""],
            ["9時", "失敗", "C2", "AQUOS sense7", "", "2026-09-20T00:00:00.000Z", "", "山田", "ブタ5000", "", "", "", ""],
            ["9時", "失敗", "C3", "", "", "2026-09-20T00:00:00.000Z", "", "", "", "", "", "", ""]]
    df = analytics.build_frame({"analytics": rows, "terminals": [[0, 0, 0, "1234", 0, "Pixel 6a"]]}, "lite", now=NOW)
    df = analytics.build_frame({"analytics": rows}, "lite", terminals={"1234": "Pixel 6a"}, now=NOW)
    assert list(df["parent_id"]) == ["1234", "個人垢", "未指定"]
    assert list(df["parent_model"]) == ["Pixel 6a", "不明", "不明"]
    assert list(df["auth_method"]) == ["LINE", "未設定", "未設定"]
    assert list(df["model"]) == ["AQUOS sense7", "AQUOS sense7", "不明"]
    assert list(df["invite_type"]) == ["ブタ5000", "ブタ5000", "未設定"]


def test_build_frame_fallback_columns_without_header():
    # ヘッダ行なし → lite の固定インデックス（f=3, child=4, j=5, date1=7, n=9, q=10, date2=13）
    row = [None] * 14
    row[3], row[4], row[5], row[7], row[9], row[10] = "成功", "C1", "Galaxy A32 5G", "2026-09-20T00:00:00.000Z", "P9", "通常招待"
    df = analytics.build_frame({"analytics": [row]}, "lite", now=NOW)
    assert len(df) == 1
    assert df.iloc[0]["model"] == "Galaxy A32 5G" and df.iloc[0]["brand"] == "Galaxy"
    assert df.iloc[0]["parent_id"] == "P9" and df.iloc[0]["invite_type"] == "通常招待"


def test_build_frame_empty_payloads():
    assert analytics.build_frame(None, "lite").empty
    assert analytics.build_frame({"analytics": []}, "lite").empty
    assert analytics.build_frame({"analytics": [sample_data.HEADERS["lite"]]}, "lite").empty


def test_parse_date_variants():
    assert analytics.parse_date("2026-09-20T00:00:00.000Z", NOW) == pd.Timestamp("2026-09-20 09:00:00")
    assert analytics.parse_date("9/20(土)", NOW) == pd.Timestamp("2026-09-20")
    assert analytics.parse_date("12/30", NOW) == pd.Timestamp("2025-12-30")   # 未来なら前年扱い
    assert pd.isna(analytics.parse_date("#REF!", NOW))
    assert pd.isna(analytics.parse_date("", NOW))
    assert pd.isna(analytics.parse_date("9月", NOW))


def test_get_brand():
    assert analytics.get_brand("AQUOS sense7") == "AQUOS"
    assert analytics.get_brand("SC-56C") == "Galaxy"
    assert analytics.get_brand("Libero 5G") == "その他"


# ---------- 期間 ----------
def test_period_bounds():
    s, e = analytics.period_bounds("今月", NOW)
    assert s == datetime(2026, 9, 1) and e == NOW
    s, e = analytics.period_bounds("先月", NOW)
    assert s == datetime(2026, 8, 1) and e == datetime(2026, 8, 31, 23, 59, 59)
    s, _ = analytics.period_bounds("7日", NOW)
    assert (NOW - s).days == 7
    s, _ = analytics.period_bounds("28日", NOW)
    assert (NOW - s).days == 28


def test_filter_period(lite_frame):
    d7 = analytics.filter_period(lite_frame, "7日", now=NOW)
    d28 = analytics.filter_period(lite_frame, "28日", now=NOW)
    last = analytics.filter_period(lite_frame, "先月", now=NOW)
    this = analytics.filter_period(lite_frame, "今月", now=NOW)
    assert 0 < len(d7) < len(d28) <= len(lite_frame)
    assert set(last["date"].dt.month) == {8}
    assert set(this["date"].dt.month) == {9}
    assert analytics.filter_period(pd.DataFrame(), "7日", now=NOW).empty


# ---------- 集計 ----------
def test_summarize_shape(lite_frame):
    rdf = analytics.filter_period(lite_frame, "28日", now=NOW)
    s = analytics.summarize(rdf)
    assert s["total"] == len(rdf)
    assert s["success"] == int(rdf["is_success"].sum())
    assert s["rate"] == round(s["success"] / s["total"] * 100, 1)
    assert s["days"] == rdf["day"].nunique()
    assert list(s["daily"].columns) == ["日付", "試行数", "成功数", "成功率"]
    assert s["daily"]["試行数"].sum() == s["total"]
    # ランキングは成功率降順
    assert s["campaign"]["成功率"].is_monotonic_decreasing
    assert s["brand"]["成功率"].is_monotonic_decreasing
    # 機種は試行数降順、親機は成功数降順
    assert s["model"]["試行数"].is_monotonic_decreasing
    assert s["parent"]["成功数"].is_monotonic_decreasing
    assert list(s["parent"].columns) == ["親機ID", "親機種", "試行数", "成功数", "成功率", "最終成功日"]
    assert set(s["interval"]["中日"]) <= set(analytics.INTERVAL_ORDER)


def test_summarize_none_for_empty():
    assert analytics.summarize(pd.DataFrame()) is None
    assert analytics.summarize(None) is None


def test_recent_days(lite_frame):
    r = analytics.recent_days(lite_frame, now=NOW)
    assert r["today"]["試行数"] == 6 and r["yesterday"]["試行数"] == 6
    assert r["today_label"] == "09/25" and r["yesterday_label"] == "09/24"
    assert 0 <= r["today"]["成功率"] <= 100
    empty = analytics.recent_days(pd.DataFrame(), now=NOW)
    assert empty["today"] is None and empty["yesterday"] is None


def test_interval_table_categories():
    header = sample_data.HEADERS["lite"]
    base = "2026-09-%02dT00:00:00.000Z"
    rows = [header]
    for d in (1, 1, 2, 5, 12):   # 同日 / 1日 / 3日 / 6日以上
        rows.append(["9時", "成功", "C", "AQUOS", "", base % d, "", "P1", "ブタ5000", "", "", "", ""])
    df = analytics.build_frame({"analytics": rows}, "lite", now=NOW)
    iv = analytics.interval_table(df)
    assert list(iv["中日"]) == ["同日(0日)", "1日", "3日", "6日以上", "初回/データなし"]


# ---------- 相場 ----------
def test_market_uses_root_modules_and_lookup():
    assert market.available()
    models = market.list_models()
    assert "AQUOS sense7" in models and len(models) == len(set(models))

    snapshots = {
        "sale": {"AQUOS sense7": {"used_query": "AQUOS sense7", "items": [
            {"name": "AQUOS sense7 SH-53C", "price": 19800, "rank": "中古Bランク", "url": "u1"},
            {"name": "AQUOS sense7 SHG10", "price": 22800, "rank": "未使用品", "url": "u2"},
            {"name": "AQUOS sense7 A208SH", "price": None, "rank": "中古Cランク", "url": "u3"},
        ]}},
        "sale_fetched_at": "2026-09-24T02:34:52+09:00",
        "kaitori_rows": [
            {"name": "docomo版SIMフリー AQUOS sense7 SH-53C", "unused_price": 17000, "used_max": 14000,
             "used_min": 9000, "brand": "aquos", "page_url": "https://k-tai-iosys.com/pricelist/smartphone/aquos/"},
            {"name": "au版 AQUOS sense7 SHG10", "unused_price": 16000, "used_max": 15000,
             "used_min": 8000, "brand": "aquos", "page_url": "https://k-tai-iosys.com/pricelist/smartphone/aquos/"},
        ],
        "kaitori_fetched_at": "2026-09-24T02:30:41+09:00",
    }
    info = market.lookup("AQUOS sense7", snapshots)
    assert info["sale"]["count"] == 2                      # price None は除外
    assert info["sale"]["min"] == 19800 and info["sale"]["max"] == 22800
    assert info["sale"]["by_rank"] == {"Bランク": 19800, "未使用": 22800}
    assert "iosys.co.jp/items?q=" in info["sale"]["search_url"]
    assert info["kaitori"]["unused_price"] == 17000
    assert info["kaitori"]["used_max"] == 15000 and info["kaitori"]["used_min"] == 8000

    none = market.lookup("Libero 5G IV (A302ZT)", snapshots)
    assert none["sale"]["count"] == 0 and none["kaitori"] is None


def test_rank_bucket():
    assert market.rank_bucket("未使用品") == "未使用"
    assert market.rank_bucket("中古Aランク") == "Aランク"
    assert market.rank_bucket("B") == "Bランク"
    assert market.rank_bucket("ジャンク") == "その他"
