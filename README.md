# Sakamichi Blog PDF

乃木坂46、櫻坂46、欅坂46、日向坂46の公式ブログをメンバー別に全件取得し、選択したブログをPDFで保存するWebアプリです。複数のブログを選ぶとZipファイルでまとめて保存します。

公開URL: https://sakamichi-blog-pdf.sakamichi-apps.workers.dev/

## 起動

このCodex環境では次のコマンドで起動できます。

```bash
./start.sh
```

ブラウザで `http://localhost:4173` を開きます。

## 通常のNode環境で使う場合

```bash
npm install
npx playwright install chromium
npm start
```

## 無料で公開する場合

Cloudflare Workers版では公式ブログの取得だけをWorkerで行い、PDFとZIPはブラウザ内で生成します。サーバー側のChromiumや生成ファイルの転送が不要なので、Cloudflare Workersの無料枠で運用できます。

```bash
npm install
npx wrangler login
npm run worker:deploy
```

ローカルでWorker版を確認する場合:

```bash
npm run worker:dev
```

## 従来のNode版

Dockerでローカル確認する場合:

```bash
docker build -t sakamichi-blog-pdf .
docker run --rm -p 4173:4173 -e PORT=4173 sakamichi-blog-pdf
```

公開先では次の環境変数を設定できます。

```bash
PORT=4173
BASIC_AUTH_USER=任意のユーザー名
BASIC_AUTH_PASSWORD=任意のパスワード
```

`BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` を両方設定すると、サイト全体にBasic認証がかかります。設定しない場合は誰でもアクセスできます。

ヘルスチェックURL:

```text
/healthz
```

## メモ

- 公式ブログの公開ページをローカルでPDF化します。
- 保存したPDF/Zipの利用は公式サイトの利用条件に沿ってください。
- 一度に保存できるブログは最大60件です。
