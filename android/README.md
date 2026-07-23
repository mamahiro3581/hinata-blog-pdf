# Sakamichi Blog PDF for Android

日向坂46、櫻坂46、欅坂46、乃木坂46の公式ブログを取得し、
PDFまたはZIPとしてAndroid端末に保存・共有するKotlin/Jetpack Composeアプリです。

ブログ取得は既存のCloudflare Worker APIを利用し、PDF/ZIP生成は端末内で行います。

## 起動方法

1. Android Studioをインストールします。
2. `android`ディレクトリをAndroid Studioで開きます。
3. Gradle Syncを実行します。
4. Android 6.0以降の実機またはエミュレータを選び、Runを実行します。

このワークスペースでは `work/android-build-env` 配下のローカルJDK/Android SDKを使って、
署名付きRelease AABの作成と `jarsigner -verify` による署名検証まで確認済みです。

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

## 今回作成したローカルビルド環境

このワークスペースでは、システムへAndroid Studioを入れずに次のローカル環境を使ってビルドしました。

- JDK: `work/android-build-env/jdk`
- Android SDK: `work/android-build-env/android-sdk`
- Gradleキャッシュ: `work/android-build-env/gradle-home`

署名用アップロードキーは次に生成済みです。

- Keystore: `work/android-upload-key/sakamichi-blog-pdf-upload.jks`
- パスワード: `work/android-upload-key/credentials.txt`
- Gradle設定: `android/keystore.properties`

`work/android-upload-key` はアプリ更新に必要です。Play Storeへ初回アップロードする前に、
安全な場所へ必ずバックアップしてください。これらの秘密ファイルはGitにはコミットしません。

ビルド済みAABは次にもコピーしています。

```text
outputs/android/sakamichi-blog-pdf-android-1.0.0-release.aab
```

## Play Store掲載画像

Play Store掲載用の画像は次に生成済みです。

```text
android/PlayStore/assets/high-res-icon-512.png
android/PlayStore/assets/feature-graphic-1024x500.png
android/PlayStore/assets/phone-01-members.png
android/PlayStore/assets/phone-02-blogs.png
android/PlayStore/assets/phone-03-export.png
```

再生成する場合は次を実行します。

```sh
node scripts/generate_play_store_assets.mjs
```

## 注意

本アプリは非公式アプリです。
公式ブログの文章・画像等の権利は各権利者に帰属します。
広告を付けて配布する場合は、公式サイトの利用条件とコンテンツの権利許諾を必ず確認してください。
