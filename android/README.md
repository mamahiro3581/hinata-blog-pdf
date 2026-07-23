# Sakamichi Blog PDF for Android

日向坂46、櫻坂46、欅坂46、乃木坂46の公式ブログを取得し、
PDFまたはZIPとしてAndroid端末に保存・共有するKotlin/Jetpack Composeアプリです。

ブログ取得は既存のCloudflare Worker APIを利用し、PDF/ZIP生成は端末内で行います。

## 起動方法

1. Android Studioをインストールします。
2. `android`ディレクトリをAndroid Studioで開きます。
3. Gradle Syncを実行します。
4. Android 6.0以降の実機またはエミュレータを選び、Runを実行します。

このMacには現在Java Runtime、Gradle、Android SDKが見つからないため、
この環境内ではAABのビルドまでは確認できていません。

## Play Store向け設定

Google Playへ提出する場合は、公開前に次を自分の値へ置き換えてください。

- `app/build.gradle.kts`
  - `applicationId`
  - `versionCode`
  - `versionName`
  - `manifestPlaceholders["adMobAppId"]`
  - `BuildConfig.ADMOB_BANNER_AD_UNIT_ID`

現在のAdMob IDはGoogle公式テストIDです。
ReleaseビルドをPlay Storeへ提出する前に、AdMobでAndroidアプリとバナー広告ユニットを作成し、
本番用IDへ変更してください。

## ビルド

Android StudioでGradle Sync後、次を実行します。

```sh
./gradlew :app:bundleRelease
```

生成されるAABは次の場所です。

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Play Consoleへアップロードするには、リリース用署名の設定が必要です。
新規アプリではPlay App Signingを有効にし、アップロードキーでAABに署名してください。

## 注意

本アプリは非公式アプリです。
公式ブログの文章・画像等の権利は各権利者に帰属します。
広告を付けて配布する場合は、公式サイトの利用条件とコンテンツの権利許諾を必ず確認してください。
