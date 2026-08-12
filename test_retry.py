"""
test_retry.py — iosys.py / kaitori.py に追加した「1回だけのバックオフ付きリトライ」の
単体確認。

対象: iosys._get_with_retry / kaitori._get_with_retry
確認したい性質:
    1. 1回目が通信例外 → 2回目で成功したら、その成功レスポンスが返る（リトライは1回だけ）
    2. 1回目が5xx（iosys）/ 429・5xx（kaitori） → 2回目で200が返ったら、その200が返る
    3. kaitoriの403はリトライしない（1回requests.getが呼ばれて終わり）
    4. 2回とも失敗したら、2回目の結果（例外 or 失敗レスポンス）がそのまま返る
       （3回目は呼ばれない＝リトライは最大1回）

ネットワーク不要（requests.get をすべてmockする）。
実行: python3 -m pytest test_retry.py -q  /  python3 test_retry.py
"""
from unittest import mock

import requests

import iosys
import kaitori


def _resp(status_code):
    r = mock.Mock()
    r.status_code = status_code
    r.text = "<html></html>"
    return r


# ---- iosys._get_with_retry ----

def test_iosys_retries_once_on_request_exception_then_succeeds():
    ok = _resp(200)
    with mock.patch.object(
        iosys.requests, "get",
        side_effect=[requests.RequestException("timeout"), ok],
    ) as m, mock.patch.object(iosys.time, "sleep") as sleep_m:
        resp = iosys._get_with_retry("https://example.com", {}, 10)
    assert resp is ok
    assert m.call_count == 2
    assert sleep_m.call_count == 1


def test_iosys_retries_once_on_5xx_then_succeeds():
    fail = _resp(503)
    ok = _resp(200)
    with mock.patch.object(iosys.requests, "get", side_effect=[fail, ok]) as m, \
            mock.patch.object(iosys.time, "sleep"):
        resp = iosys._get_with_retry("https://example.com", {}, 10)
    assert resp is ok
    assert m.call_count == 2


def test_iosys_does_not_retry_on_200():
    ok = _resp(200)
    with mock.patch.object(iosys.requests, "get", side_effect=[ok]) as m, \
            mock.patch.object(iosys.time, "sleep") as sleep_m:
        resp = iosys._get_with_retry("https://example.com", {}, 10)
    assert resp is ok
    assert m.call_count == 1
    assert sleep_m.call_count == 0


def test_iosys_does_not_retry_on_204():
    empty = _resp(204)
    with mock.patch.object(iosys.requests, "get", side_effect=[empty]) as m, \
            mock.patch.object(iosys.time, "sleep") as sleep_m:
        resp = iosys._get_with_retry("https://example.com", {}, 10)
    assert resp is empty
    assert m.call_count == 1
    assert sleep_m.call_count == 0


def test_iosys_gives_up_after_one_retry_on_repeated_exception():
    with mock.patch.object(
        iosys.requests, "get",
        side_effect=[requests.RequestException("timeout1"), requests.RequestException("timeout2")],
    ) as m, mock.patch.object(iosys.time, "sleep"):
        try:
            iosys._get_with_retry("https://example.com", {}, 10)
            raised = False
        except requests.RequestException:
            raised = True
    assert raised
    assert m.call_count == 2  # 3回目は呼ばれない


def test_iosys_gives_up_after_one_retry_on_repeated_5xx():
    fail1 = _resp(502)
    fail2 = _resp(502)
    with mock.patch.object(iosys.requests, "get", side_effect=[fail1, fail2]) as m, \
            mock.patch.object(iosys.time, "sleep"):
        resp = iosys._get_with_retry("https://example.com", {}, 10)
    assert resp is fail2
    assert m.call_count == 2


# ---- kaitori._get_with_retry ----

def test_kaitori_retries_once_on_request_exception_then_succeeds():
    ok = _resp(200)
    with mock.patch.object(
        kaitori.requests, "get",
        side_effect=[requests.RequestException("timeout"), ok],
    ) as m, mock.patch.object(kaitori.time, "sleep"):
        resp = kaitori._get_with_retry("https://example.com", {}, 15)
    assert resp is ok
    assert m.call_count == 2


def test_kaitori_retries_once_on_429_then_succeeds():
    fail = _resp(429)
    ok = _resp(200)
    with mock.patch.object(kaitori.requests, "get", side_effect=[fail, ok]) as m, \
            mock.patch.object(kaitori.time, "sleep"):
        resp = kaitori._get_with_retry("https://example.com", {}, 15)
    assert resp is ok
    assert m.call_count == 2


def test_kaitori_retries_once_on_5xx_then_succeeds():
    fail = _resp(500)
    ok = _resp(200)
    with mock.patch.object(kaitori.requests, "get", side_effect=[fail, ok]) as m, \
            mock.patch.object(kaitori.time, "sleep"):
        resp = kaitori._get_with_retry("https://example.com", {}, 15)
    assert resp is ok
    assert m.call_count == 2


def test_kaitori_does_not_retry_on_403():
    forbidden = _resp(403)
    with mock.patch.object(kaitori.requests, "get", side_effect=[forbidden]) as m, \
            mock.patch.object(kaitori.time, "sleep") as sleep_m:
        resp = kaitori._get_with_retry("https://example.com", {}, 15)
    assert resp is forbidden
    assert m.call_count == 1
    assert sleep_m.call_count == 0


def test_kaitori_gives_up_after_one_retry_on_repeated_5xx():
    fail1 = _resp(500)
    fail2 = _resp(500)
    with mock.patch.object(kaitori.requests, "get", side_effect=[fail1, fail2]) as m, \
            mock.patch.object(kaitori.time, "sleep"):
        resp = kaitori._get_with_retry("https://example.com", {}, 15)
    assert resp is fail2
    assert m.call_count == 2  # 3回目は呼ばれない


def test_kaitori_fetch_brand_uses_retry_and_gives_up_gracefully_on_403():
    """403は本番の想定内応答。fetch_brand経由でも即諦めてエラー扱いになること
    （リトライで粘らない＝呼び出し回数1回）。"""
    forbidden = _resp(403)
    with mock.patch.object(kaitori.requests, "get", side_effect=[forbidden]) as m, \
            mock.patch.object(kaitori.time, "sleep") as sleep_m:
        rows, error = kaitori.fetch_brand("iphone")
    assert rows == []
    assert error is not None
    assert "403" in error
    assert m.call_count == 1
    assert sleep_m.call_count == 0


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
