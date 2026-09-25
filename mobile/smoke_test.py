"""
smoke_test.py — モバイル版アプリ全体の起動確認（streamlit.testing.v1.AppTest）。

GAS への通信は行わず、analytics.fetch_payload をダミーデータに差し替えて実行する。
実行: python3 mobile/smoke_test.py（リポジトリルートから）
"""
import os
import sys
from unittest import mock

from streamlit.testing.v1 import AppTest

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import analytics  # noqa: E402
import sample_data  # noqa: E402


def _fake_fetch(target_app, force_key=None, session=None):
    return sample_data.make_payload(target_app, days=35, per_day=8)


def _run(at):
    at.run()
    if at.exception:
        print("NG: 例外が発生しました")
        for e in at.exception:
            print("  ", e.message)
        return False
    if at.error:
        print("NG: エラー表示があります")
        for e in at.error:
            print("  ", e.value)
        return False
    return True


def main():
    with mock.patch.object(analytics, "fetch_payload", side_effect=_fake_fetch), \
         mock.patch.object(analytics, "fetch_invite_id_map", return_value={}):
        at = AppTest.from_file(os.path.join(HERE, "app.py"), default_timeout=120)
        if not _run(at):
            return 1
        texts = " ".join(m.value for m in at.markdown)
        assert "本日の成功数" in texts, "今日タブのカードが描画されていません"
        print(f"OK: 起動 (タブ数: {len(at.tabs)}, 表: {len(at.dataframe)}, 図: {len(at.get('plotly_chart'))})")

        # 相場タブ: 機種を選んでカードが出ること
        at.selectbox(key="mk_model").select("AQUOS sense7")
        if not _run(at):
            return 1
        texts = " ".join(m.value for m in at.markdown)
        assert "買取価格（イオシス買取）" in texts and "中央値" in texts, "相場カードが描画されていません"
        print("OK: 相場タブ (AQUOS sense7)")

        # 機種表・親機表の「全件表示」トグル
        at.toggle(key="res_model_all").set_value(True)
        at.toggle(key="par_all").set_value(True)
        if not _run(at):
            return 1
        print("OK: 全件表示トグル")

        # 本家（original）でも起動すること
        at2 = AppTest.from_file(os.path.join(HERE, "app.py"), default_timeout=120)
        at2.session_state["app_mode"] = "TikTok 本家"
        if not _run(at2):
            return 1
        print("OK: 本家モード")
    return 0


if __name__ == "__main__":
    sys.exit(main())
