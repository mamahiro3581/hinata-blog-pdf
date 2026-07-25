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
- ストア掲載用アイコン/フィーチャー画像/スマホ/タブレット画像をPlay Consoleへ登録
- 署名付きAAB `1 (1.0.0)` と難読化解除ファイルを内部テストへ登録
- 初回リリースノートを登録し、内部テスト版を公開
- 専用メーリングリストを内部テストへ紐づけ、テストトラックを有効化
- 実機ログから `1.0.0` の起動クラッシュをWorkManager/RoomのR8最適化問題と特定
- Roomデータベース実装のコンストラクタを保持するルールを追加
- 修正版 `1.0.1` のRelease APK/AABをビルドし、Lintと署名を確認
- 実機へ診断用Release APKをインストールし、通常UIとテスト広告の起動を確認
- 修正版 `2 (1.0.1)` と難読化解除ファイルを内部テストへ登録して公開
- WebViewの画面外部分がPDFで白紙になる問題を文書全体描画とソフトウェア描画で修正
- 修正版 `1.0.2` のRelease APK/AABをビルドし、Lintと署名を確認
- 実機で11ページのブログPDFを作成し、全ページに文章または画像が描画されることを確認
- PDF本文を10pt、画像をページ幅の最大75%へ変更
- 文字のない余白で改ページし、文字切れと画像分断を防止してSourceを最終ページのフッターへ配置
- 実機で13ページのブログPDFを作成し、文字切れ、画像分断、Source単独ページがないことを確認
- 選択PDF保存ボタンを画面下部へ固定し、一覧スクロール中も表示・有効化されることを実機確認

## 成果物

```text
outputs/android/sakamichi-blog-pdf-android-1.0.0-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.0-mapping.txt
outputs/android/sakamichi-blog-pdf-android-1.0.1-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.1-mapping.txt
outputs/android/sakamichi-blog-pdf-android-1.0.2-release.aab
outputs/android/sakamichi-blog-pdf-android-1.0.2-mapping.txt
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
- 公式ブログのコンテンツ取得・PDF化・広告収益化の権利確認
- 修正版 `1.0.2` のAABと難読化解除ファイルを内部テストへ登録して公開
- Android実機で内部テストへ参加し、ブログ取得・PDF保存・ZIP保存・広告表示を確認
- クローズドテストの要件を満たす
- 問題がなければ製品版へリリース申請

## 現在のブロッカー

- Play Consoleの新規個人開発者アカウントでは、製品版公開前に
  12人以上のテスターによる14日以上のクローズドテストが必要になる場合がある。
- 本番公開前に、公式ブログのコンテンツ取得・PDF化・広告収益化に必要な権利確認が必要。

## 重要

署名キーは次にあります。

```text
work/android-upload-key/sakamichi-blog-pdf-upload.jks
work/android-upload-key/credentials.txt
```

このキーを失うと同じアプリを更新できなくなる可能性があります。
Play Consoleへ初回アップロードする前に安全な場所へバックアップしてください。
