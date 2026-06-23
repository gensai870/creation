# Disaster Deck AI v2

講演会の訪問先の地震想定・被害情報をもとに、講座スライドの「想定地震」「被害例」
2枚を生成し、PowerPoint (.pptx) / PDF でダウンロードするツール。

## 技術スタック

- React + Vite + TypeScript
- Tailwind CSS v4（`@tailwindcss/vite`）
- pptxgenjs（PowerPoint 生成）
- html2canvas + jsPDF（PDF 生成）
- Python スクレイパー（Playwright + Requests / J-SHIS API）

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
```

## スクレイパー（地震データ収集）

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

python scraper.py --pref 東京都 --city 渋谷区
# → public/earthquake_data.json を生成（アプリの Step 1「自動読み込み」が読む）
```

> 注: スクレイパーの自動データ取得は現状不安定（J-SHIS API のエンドポイント要修正、
> Google 検索経由のスクレイピングは headless でブロックされる）。
> 確実な経路はアプリ Step 1 が生成する「Claude in Chrome 用プロンプト」での手動収集。

## スライド生成方式（重要）

pptxgenjs は既存 .pptx の編集ができないため、本ツールは
**「想定地震」「被害例」の差し替え用2枚を新規 .pptx として生成**する。
講師が本編デッキの該当ページ（スライド2・3）に差し込む運用。
PDF も同じ2枚を出力する。

## 4ステップフロー

1. 地域入力（＋ Claude in Chrome 用プロンプト生成 / スクレイパー結果の自動読み込み）
2. 想定地震入力（複数追加可）
3. 被害リスク設定（震度別ボタン選択）
4. プレビュー → PowerPoint / PDF ダウンロード

## デプロイ

Vercel（Vite フレームワークとして自動検出）。GitHub 連携で自動デプロイ。
