# 公開チェックリスト

## 必須

- [ ] Apple Developer Programの有料メンバーシップを有効にする
- [ ] App Store Connectで新規アプリを作成する
- [ ] Bundle ID `com.mamahiro3581.SakamichiBlogPDF` を登録する
- [ ] 4公式サイトのコンテンツを取得・PDF化・広告収益化する許諾を確認する
- [ ] AdMobでiOSアプリを登録し、公開用アプリIDとバナー広告ユニットIDを作成する
- [ ] AdMobのPrivacy & messagingで同意メッセージを公開する
- [ ] `Info.plist`のテスト用AdMob IDを公開用IDへ置き換える
- [ ] GitHub Pagesを有効にしてプライバシー・サポートページを公開する
- [ ] App Store ConnectのApp Privacyを広告SDKの収集内容に合わせて入力する
- [ ] 6.9インチ、6.5インチ、iPad向けスクリーンショットを登録する
- [ ] 権利許諾資料を審査メモへ添付する

## AdMob IDの置換場所

`SakamichiBlogPDF/Info.plist`

- `GADApplicationIdentifier`
- `AdMobBannerAdUnitIdentifier`

Debugビルドは誤クリック防止のため、常にGoogle公式テスト広告ユニットを使用します。
Releaseビルドでは公開用IDへ置換されていない場合、広告を表示しません。

## Archive

1. XcodeのSigning & Capabilitiesで有料Developer Teamを選択する
2. 実機向けの`Any iOS Device`を選択する
3. Product > Archiveを実行する
4. OrganizerでValidate Appを実行する
5. Distribute App > App Store Connect > Uploadを実行する
