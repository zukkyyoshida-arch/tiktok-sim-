"""
demo.py — ネットワーク無しでモバイル版の画面を確認するための起動ラッパー。

GAS への通信をダミーデータ（sample_data.py）に差し替えてから app.py を実行する。
実行: streamlit run mobile/demo.py
"""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import analytics  # noqa: E402
import sample_data  # noqa: E402

analytics.fetch_payload = lambda target_app, force_key=None, session=None: sample_data.make_payload(target_app, days=35, per_day=8)
analytics.fetch_invite_id_map = lambda: {}

runpy.run_path(os.path.join(HERE, "app.py"), run_name="__main__")
