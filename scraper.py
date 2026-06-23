"""
Disaster Deck AI - 地震情報自動収集スクレイパー
使い方: python scraper.py --pref 東京都 --city 渋谷区

出力: public/earthquake_data.json（Reactアプリが読み込む）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

OUTPUT_PATH = Path(__file__).parent / "public" / "earthquake_data.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

# ──────────────────────────────────────────────
# 1. J-SHIS（地震ハザードステーション）API
#    政府公式・構造化データ・APIあり → 最優先
#
#    フロー:
#      ① 住所 → 緯度経度（国土地理院ジオコーディング・無料）
#      ② 緯度経度 → メッシュ別被害地震検索 API (fltsearch)
#    参考: https://www.j-shis.bosai.go.jp/api-fltsearch-mesh
# ──────────────────────────────────────────────
JSHIS_VERSION = "Y2020"  # 地図バージョン（Y2008〜対応）


def geocode(pref: str, city: str) -> tuple[float, float] | None:
    """国土地理院ジオコーディングで住所 → (経度, 緯度)"""
    try:
        url = (
            "https://msearch.gsi.go.jp/address-search/AddressSearch"
            f"?q={quote(pref + city)}"
        )
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        items = r.json()
        if not items:
            return None
        lon, lat = items[0]["geometry"]["coordinates"]
        return float(lon), float(lat)
    except Exception as e:
        print(f"[GSI geocode] エラー: {e}", file=sys.stderr)
        return None


def ijma_to_shindo(ijma: float) -> str:
    """計測震度（数値）→ 震度階級ラベル"""
    if ijma >= 6.5:
        return "7"
    if ijma >= 6.0:
        return "6強"
    if ijma >= 5.5:
        return "6弱"
    if ijma >= 5.0:
        return "5強"
    if ijma >= 4.5:
        return "5弱"
    if ijma >= 3.5:
        return "4"
    if ijma >= 2.5:
        return "3"
    return f"{round(ijma)}"


# グループ化用: 「（パターンN）」「（最大クラス）」等の枝番を除いた基本名でまとめる
_VARIANT_RE = re.compile(r"（[^）]*(?:パターン|ケース|最大クラス|想定)[^）]*）")
_NUM_RE = re.compile(r"\d+\.?\d*")


def fetch_jshis(pref: str, city: str) -> dict | None:
    """J-SHIS fltsearch API から、その地点に影響する被害地震を取得"""
    try:
        coord = geocode(pref, city)
        if not coord:
            return None
        lon, lat = coord

        url = (
            "https://www.j-shis.bosai.go.jp/map/api/fltsearch"
            f"?position={lon},{lat}&epsg=4326&mode=C"
            f"&version={JSHIS_VERSION}&case=AVR&period=P_T30&format=json"
        )
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "Success":
            return None

        # Fault[] は、入れ子の Pattern[] を持つものと持たないものが混在 → 平坦化
        flat = []
        for f in data.get("Fault", []):
            flat.extend(f["Pattern"] if "Pattern" in f else [f])

        # 基本名でグループ化し、最大震度・確率・M範囲を集約
        groups: dict[str, dict] = {}
        for e in flat:
            name = _VARIANT_RE.sub("", e.get("ltename", "")).strip()
            if not name:
                continue
            mags = [float(x) for x in _NUM_RE.findall(e.get("magnitude", ""))]
            try:
                ijma = float(e.get("ijma", "0"))
            except ValueError:
                ijma = 0.0
            try:
                prob = float(e.get("probability", "0"))
            except ValueError:
                prob = 0.0

            g = groups.setdefault(name, {"mags": [], "ijma": 0.0, "prob": 0.0})
            g["mags"].extend(mags)
            g["ijma"] = max(g["ijma"], ijma)
            g["prob"] = max(g["prob"], prob)

        earthquakes = []
        for name, g in sorted(groups.items(), key=lambda kv: kv[1]["prob"], reverse=True):
            mags = g["mags"]
            if mags:
                lo, hi = min(mags), max(mags)
                mag_str = f"{lo}" if lo == hi else f"{lo}〜{hi}"
            else:
                mag_str = ""
            prob_str = (
                f"30年以内に{round(g['prob'] * 100, 1)}%" if g["prob"] > 0 else ""
            )
            earthquakes.append({
                "name": name,
                "magnitude": mag_str,
                "intensity": ijma_to_shindo(g["ijma"]) if g["ijma"] else "",
                "probability": prob_str,
            })

        earthquakes = earthquakes[:6]
        if earthquakes:
            return {
                "source": (
                    "J-SHIS 地震ハザードステーション"
                    "（国立研究開発法人防災科学技術研究所, "
                    f"{JSHIS_VERSION}・30年確率・平均ケース）"
                ),
                "earthquakes": earthquakes,
            }
    except Exception as e:
        print(f"[J-SHIS] エラー: {e}", file=sys.stderr)
    return None


# ──────────────────────────────────────────────
# 2. 内閣府 地震被害想定 PDF/ページ検索
#    Playwright でサイト検索 → テキスト抽出
# ──────────────────────────────────────────────
INTENSITY_PATTERN = re.compile(
    r"(震度\s*[4-7][弱強]?(?:\s*[〜~]\s*震度?\s*[4-7][弱強]?)?)"
)
MAGNITUDE_PATTERN = re.compile(r"M\s*(\d+(?:\.\d+)?)")
EQ_NAME_PATTERN = re.compile(
    r"([\u3040-\u9FFF\w]+(?:断層|地震|トラフ|海溝|直下)[^\s。、\n]{0,20})"
)
PROB_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def parse_earthquake_text(text: str) -> list[dict]:
    """テキストから地震情報を正規表現で抽出"""
    results = []
    # 行単位で処理
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 5:
            continue

        names = EQ_NAME_PATTERN.findall(line)
        magnitudes = MAGNITUDE_PATTERN.findall(line)
        intensities = INTENSITY_PATTERN.findall(line)
        probs = PROB_PATTERN.findall(line)

        if not names or not (magnitudes or intensities):
            continue

        name = names[0][:30]
        mag = magnitudes[0] if magnitudes else ""
        intensity = intensities[0] if intensities else ""
        prob = f"30年以内に{probs[0]}%" if probs else ""

        # 重複除去
        if any(r["name"] == name for r in results):
            continue

        results.append({
            "name": name,
            "magnitude": mag,
            "intensity": intensity,
            "probability": prob,
        })

    return results[:8]


def fetch_pref_site(pref: str, city: str) -> dict | None:
    """Playwright で県・市町村サイトの想定地震ページを取得"""
    queries = [
        f"{pref} {city} 地震被害想定 断層",
        f"{pref} 地震被害想定 想定震度",
        f"{city} ハザードマップ 想定地震",
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(extra_http_headers=HEADERS)

        for query in queries:
            try:
                search_url = f"https://www.google.com/search?q={quote(query)}"
                page.goto(search_url, timeout=15000)
                time.sleep(1)

                # 検索結果から公式サイト（.lg.jp / .go.jp）を優先取得
                links = page.eval_on_selector_all(
                    "a[href]",
                    "els => els.map(e => e.href)"
                )
                official_links = [
                    l for l in links
                    if (".lg.jp" in l or ".go.jp" in l or "pref." in l)
                    and "google" not in l
                    and l.startswith("http")
                ][:3]

                for link in official_links:
                    try:
                        page.goto(link, timeout=15000)
                        time.sleep(1)
                        text = page.inner_text("body")
                        eqs = parse_earthquake_text(text)
                        if eqs:
                            # 出典URL・更新日を取得
                            source = link
                            # ページ内の「更新日」テキストを探す
                            update_match = re.search(
                                r"(更新日|改定日|公表)[：:]\s*([\d年月日]+)", text
                            )
                            if update_match:
                                source += f"（{update_match.group(2)}更新）"

                            browser.close()
                            return {"source": source, "earthquakes": eqs}
                    except Exception:
                        continue

            except Exception as e:
                print(f"[Playwright] {query}: {e}", file=sys.stderr)
                continue

        browser.close()
    return None


# ──────────────────────────────────────────────
# 3. 想定被害（震度別リスク）の取得
#    内閣府・都道府県の被害想定ページから
# ──────────────────────────────────────────────
DAMAGE_KEYWORDS = {
    "移動・転倒物":     ["転倒", "移動", "什器", "家具"],
    "ガラスの破損・落下": ["ガラス", "窓ガラス", "破損", "落下"],
    "天井材等落下物":   ["天井", "崩落", "落下物", "天井材"],
    "建物倒壊":        ["倒壊", "全壊", "建物被害", "耐震"],
}

INTENSITY_LEVELS = ["5弱", "5強", "6弱", "6強", "7"]


def extract_damage_risks(text: str) -> dict:
    """テキストから震度別リスクを推定"""
    risks = {}
    for damage_type, keywords in DAMAGE_KEYWORDS.items():
        best_intensity = "6弱"  # デフォルト
        for line in text.splitlines():
            if any(kw in line for kw in keywords):
                found = INTENSITY_PATTERN.findall(line)
                if found:
                    # 最も低い震度（発生し始め）を採用
                    for lvl in INTENSITY_LEVELS:
                        if any(lvl in f for f in found):
                            best_intensity = lvl
                            break
        risks[damage_type] = best_intensity
    return risks


# ──────────────────────────────────────────────
# メイン処理
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="地震情報自動収集スクレイパー")
    parser.add_argument("--pref", required=True, help="都道府県（例：東京都）")
    parser.add_argument("--city", required=True, help="市区町村（例：渋谷区）")
    args = parser.parse_args()

    pref, city = args.pref, args.city
    print(f"🔍 収集開始: {pref} {city}")

    result = {
        "pref": pref,
        "city": city,
        "earthquakes": [],
        "source1": "",
        "damageRisks": {
            "移動・転倒物": "6弱",
            "ガラスの破損・落下": "6弱",
            "天井材等落下物": "6強",
            "建物倒壊": "7",
        },
        "source2": "",
    }

    # Step 1: J-SHIS API（最優先・構造化データ）
    print("  [1/3] J-SHIS API を確認中...")
    jshis = fetch_jshis(pref, city)
    if jshis:
        result["earthquakes"] = jshis["earthquakes"]
        result["source1"] = jshis["source"]
        print(f"  ✅ J-SHIS: {len(jshis['earthquakes'])}件取得")
    else:
        print("  ⚠️  J-SHIS: 該当データなし → 県・市サイトを検索")

    # Step 2: 県・市サイト（Playwright）
    if not result["earthquakes"]:
        print("  [2/3] 県・市町村サイトをスクレイピング中...")
        pref_data = fetch_pref_site(pref, city)
        if pref_data:
            result["earthquakes"] = pref_data["earthquakes"]
            result["source1"] = pref_data["source"]
            print(f"  ✅ 県・市サイト: {len(pref_data['earthquakes'])}件取得")
        else:
            print("  ⚠️  県・市サイト: 取得できませんでした")
    else:
        print("  [2/3] スキップ（J-SHIS で取得済み）")

    # Step 3: 被害想定リスク（Playwright）
    print("  [3/3] 被害想定リスクを収集中...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(extra_http_headers=HEADERS)
        try:
            query = f"{pref} {city} 地震被害想定 震度 倒壊 天井"
            page.goto(
                f"https://www.google.com/search?q={quote(query)}",
                timeout=15000
            )
            time.sleep(1)
            links = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(e => e.href)"
            )
            official = [
                l for l in links
                if (".lg.jp" in l or ".go.jp" in l) and "google" not in l
            ][:2]
            for link in official:
                try:
                    page.goto(link, timeout=15000)
                    text = page.inner_text("body")
                    risks = extract_damage_risks(text)
                    if any(v != "6弱" for v in risks.values()):
                        result["damageRisks"] = risks
                        result["source2"] = link
                        print(f"  ✅ 被害想定: {link[:60]}...")
                        break
                except Exception:
                    continue
        except Exception as e:
            print(f"  ⚠️  被害想定: {e}", file=sys.stderr)
        finally:
            browser.close()

    # JSON 出力
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完了: {OUTPUT_PATH}")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
