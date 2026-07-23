# Google Play 提出状況

## 完了

- Androidプロジェクト作成
- JDK/Android SDK/Gradleのローカルビルド環境作成
- Android 16/API 36 target設定
- AdMob/UMP SDK組み込み
- ローカルアップロードキー作成
- 署名付きRelease AAB作成
- `jarsigner -verify`で署名検証
- Play Store掲載文案とチェックリスト作成
- プライバシーポリシー/サポートページのAndroid対応

## 成果物

```text
outputs/android/sakamichi-blog-pdf-android-1.0.0-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.0-mapping.txt
```

## Play Consoleで残っている作業

- Google Play Console開発者アカウントで新規アプリを作成
- 本番用AdMob AndroidアプリID/広告ユニットIDへ差し替え
- AdMob Privacy & messagingの同意メッセージ公開
- データセーフティ、広告の有無、コンテンツレーティングの入力
- ストア掲載画像、スクリーンショット、フィーチャー画像の登録
- 公式ブログのコンテンツ取得・PDF化・広告収益化の権利確認
- 内部テストへAABをアップロードして実機確認
- 問題がなければ製品版へリリース申請

## 重要

署名キーは次にあります。

```text
work/android-upload-key/sakamichi-blog-pdf-upload.jks
work/android-upload-key/credentials.txt
```

このキーを失うと同じアプリを更新できなくなる可能性があります。
Play Consoleへ初回アップロードする前に安全な場所へバックアップしてください。
