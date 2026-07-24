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
- Play Store掲載用アイコン/フィーチャー画像/スマホスクリーンショット生成
- Play Store掲載用7インチ/10インチタブレットスクリーンショット生成
- プライバシーポリシー/サポートページのAndroid対応
- Play Consoleで新規アプリ作成
- Play ConsoleでプライバシーポリシーURL登録
- Play Consoleでアプリのアクセス権、広告、政府機関アプリ、金融機能、健康関連機能を申告
- Play Consoleでストアカテゴリを「ツール」に設定
- Play Consoleでストア掲載文を保存
- Play Consoleで対象ユーザーを13歳以上に設定
- Play Consoleでデータセーフティを保存
- 公開用サポートメールを作成し、ストアの公開連絡先へ登録
- IARCコンテンツレーティング質問票を送信
- コンテンツレーティング「3歳以上 / 全ユーザー対象」を取得

## 成果物

```text
outputs/android/sakamichi-blog-pdf-android-1.0.0-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.0-mapping.txt
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

## Play Consoleで残っている作業

- 本番用AdMob AndroidアプリID/広告ユニットIDへ差し替え
- AdMob Privacy & messagingの同意メッセージ公開
- ストア掲載画像、スクリーンショット、フィーチャー画像のPlay Console登録
- 公式ブログのコンテンツ取得・PDF化・広告収益化の権利確認
- 内部テストへAABをアップロードして実機確認
- クローズドテストの要件を満たす
- 問題がなければ製品版へリリース申請

## 現在のブロッカー

- Chrome拡張のファイルアクセス権限は有効化済みだが、Play Consoleの画像ライブラリが
  アップロード後に読み込み中のまま停止している。Chromeまたは拡張機能を再起動して
  画像とAABのアップロードを再試行する必要がある。
- Play Consoleの新規個人開発者アカウントでは、製品版公開前に
  12人以上のテスターによる14日以上のクローズドテストが必要になる場合がある。

## 重要

署名キーは次にあります。

```text
work/android-upload-key/sakamichi-blog-pdf-upload.jks
work/android-upload-key/credentials.txt
```

このキーを失うと同じアプリを更新できなくなる可能性があります。
Play Consoleへ初回アップロードする前に安全な場所へバックアップしてください。
