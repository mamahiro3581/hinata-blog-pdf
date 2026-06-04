# Hinata Blog PDF

日向坂46公式ブログをメンバー別に全件取得し、選択したブログをPDFで保存するローカルWebアプリです。複数のブログを選ぶとZipファイルでまとめて保存します。

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

## 公開する場合

このアプリはPDF生成にNode.jsとChromiumが必要なので、GitHub Pagesのような静的ホスティングでは動きません。Docker対応のWebサービスにデプロイしてください。

Renderに公開する場合:

1. このフォルダをGitHubリポジトリにpushします。
2. RenderでBlueprintを作成し、このリポジトリを選択します。
3. `render.yaml` が読み込まれ、Docker Web Serviceとして作成されます。
4. 画面の指示に従い、必要なら `BASIC_AUTH_USER` と `BASIC_AUTH_PASSWORD` を設定します。

Dockerでローカル確認する場合:

```bash
docker build -t hinata-blog-pdf .
docker run --rm -p 4173:4173 -e PORT=4173 hinata-blog-pdf
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
