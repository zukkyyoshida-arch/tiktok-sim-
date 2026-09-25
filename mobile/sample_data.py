"""
sample_data.py — ネットワーク無しでモバイル版を動かすためのダミーペイロード生成。

用途: 単体テスト（test_analytics.py）、スモークテスト（smoke_test.py）、
      画面確認（`python3 mobile/demo.py` 経由の起動）。
本番データの列構成（ヘッダ名）に合わせているが、値はすべて架空。
"""
import random
from datetime import datetime, timedelta

HEADERS = {
    "lite": ["時刻", "状態", "端末番号", "機種", "招待方法", "Tik開始", "時刻", "親",
             "招待種類", "親の種類", "検証2", "曜日", "稼働時間"],
    "original": ["状態", "端末番号", "子種別", "子認証方法", "機種", "Tik開始", "時刻", "親", "招待種類"],
}

MODELS = ["AQUOS sense7", "Xperia 10 IV SO-52C", "OPPO Reno7 A", "Galaxy A32 5G", "Pixel 6a",
          "arrows We", "iPhone SE2", "Redmi 12 5G", "BASIO 4", "AQUOS wish2"]
PARENTS = [("P001", "AQUOS sense7"), ("P002", "Xperia 10 IV SO-52C"), ("P003", "Galaxy A32 5G"),
           ("P004", "OPPO Reno7 A"), ("P005", "Pixel 6a"), ("P006", "iPhone SE2"), ("P007", "arrows We")]
CAMPAIGNS = ["ブタ5000", "QRコード招待", "通常招待", "即招待"]
PARENT_TYPES = ["新規", "復活", "未設定"]


def make_payload(target_app="lite", days=40, per_day=12, seed=7, now=None):
    """GAS の get_analytics 応答と同じ形（{"analytics": 行列, "terminals": 行列}）を返す。"""
    rng = random.Random(seed)
    now = now or datetime.now()
    header = HEADERS[target_app]
    rows = [list(header)]

    for d in range(days, -1, -1):
        day = (now - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        iso = day.strftime("%Y-%m-%dT00:00:00.000Z")
        for _ in range(per_day):
            model = rng.choice(MODELS)
            pid, _pmodel = rng.choice(PARENTS)
            ok = rng.random() < (0.85 if "AQUOS" in model else 0.65)
            status = "成功" if ok else rng.choice(["失敗", "失敗(凍結)"])
            campaign = rng.choice(CAMPAIGNS)
            child = f"C{rng.randint(1, 400):03d}"
            hour = f"{rng.randint(9, 22)}時"
            if target_app == "lite":
                auth = rng.choice(["Google認証", "LINE認証"])
                rows.append([hour, status, child, model, auth, iso, day.strftime("%m/%d"), pid,
                             campaign, rng.choice(PARENT_TYPES), "", "月", "4h"])
            else:
                auth = rng.choice(["Google", "LINE"])
                rows.append([status, child, "通常", auth, model, iso, day.strftime("%m/%d"), pid, campaign])

    # ノイズ行（招待種類が4桁数字）と、未来のスケジュール行を混ぜる（除外されることを確認するため）
    future = (now + timedelta(days=3)).strftime("%Y-%m-%dT00:00:00.000Z")
    if target_app == "lite":
        rows.append(["10時", "成功", "C999", "AQUOS sense7", "Google認証", iso, "", "P001", "2024", "新規", "", "月", "4h"])
        rows.append(["10時", "", "C998", "AQUOS sense7", "", future, "", "P001", "ブタ5000", "新規", "", "月", "4h"])
    else:
        rows.append(["成功", "C999", "通常", "Google", "AQUOS sense7", iso, "", "P001", "2024"])
        rows.append(["", "C998", "通常", "", "AQUOS sense7", future, "", "P001", "ブタ5000"])

    terminals = [[None, None, None, pid, None, pmodel] for pid, pmodel in PARENTS]
    return {"analytics": rows, "terminals": terminals}
