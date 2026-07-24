# Google Play 公開チェックリスト

## 必須

- [x] Google Play Consoleの開発者アカウントを有効にする
- [x] Play Consoleで新規アプリを作成する
- [x] パッケージ名 `com.mamahiro3581.sakamichiblogpdf` を最終決定する
- [ ] 4公式サイトのコンテンツ取得・PDF化・広告収益化の許諾を確認する
- [ ] AdMobでAndroidアプリを登録し、本番用アプリIDとバナー広告ユニットIDを作成する
- [ ] `android/app/build.gradle.kts`のAdMobテストIDを本番用IDへ置き換える
- [ ] AdMobのPrivacy & messagingで同意メッセージを公開する
- [x] プライバシーポリシーとサポートページを公開する
- [x] Play Consoleのデータセーフティを広告SDKの収集内容に合わせて入力する
- [x] ストア掲載用スクリーンショット、アイコン、フィーチャー画像を生成する
- [x] ストア掲載用スクリーンショット、アイコン、フィーチャー画像をPlay Consoleへ登録する
- [x] リリース用アップロードキーを作成し、AABへ署名する
- [x] ローカル用アップロードキーを作成し、AABへ署名する
- [x] `./gradlew :app:bundleRelease`でAABを作成する
- [x] 公開用サポートメールを用意し、Play Consoleの連絡先とIARCコンテンツレーティングに入力する
- [x] コンテンツレーティング質問票を完了する
- [x] AABと難読化解除ファイルを内部テストへ登録する
- [x] 内部テスト版 `1 (1.0.0)` を公開し、テスターリストを有効にする
- [x] `1.0.0` の起動クラッシュを実機ログから特定し、`1.0.1` で修正する
- [x] 診断用Release APKで通常UIとテスト広告が起動することを実機確認する
- [ ] 修正版 `2 (1.0.1)` を内部テストへ公開する
- [ ] Android実機でブログ取得・PDF保存・ZIP保存・広告表示を確認する
- [ ] 権利許諾資料を審査メモへ添付する

## 作成済み成果物

```text
outputs/android/sakamichi-blog-pdf-android-1.0.0-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.0-mapping.txt
outputs/android/sakamichi-blog-pdf-android-1.0.1-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.1-mapping.txt
```

Play Store掲載画像:

```text
android/PlayStore/assets/high-res-icon-512.png
android/PlayStore/assets/feature-graphic-1024x500.png
android/PlayStore/assets/phone-01-members.png
android/PlayStore/assets/phone-02-blogs.png
android/PlayStore/assets/phone-03-export.png
android/PlayStore/assets/tablet-7-01-members.png
android/PlayStore/assets/tablet-7-02-blogs.png
android/PlayStore/assets/tablet-7-03-export.png
android/PlayStore/assets/tablet-10-01-members.png
android/PlayStore/assets/tablet-10-02-blogs.png
android/PlayStore/assets/tablet-10-03-export.png
```

アップロードキー:

```text
work/android-upload-key/sakamichi-blog-pdf-upload.jks
work/android-upload-key/credentials.txt
```

このアップロードキーとパスワードは今後の更新にも必要です。

## Play Store提出手順

1. Play Console > すべてのアプリ > アプリを作成
2. アプリ名、デフォルト言語、アプリ/ゲーム、無料/有料、連絡先メールを入力
3. ストア掲載情報、データセーフティ、広告の有無、コンテンツのレーティングを入力
4. テストとリリース > 内部テストでAABをアップロード
5. テスターで動作確認
6. 問題がなければ製品版リリースへ進む

## AAB作成

Android Studioで署名設定を作成したあと、次を実行します。

```sh
./gradlew :app:bundleRelease
```

出力:

```text
android/app/build/outputs/bundle/release/app-release.aab
```
