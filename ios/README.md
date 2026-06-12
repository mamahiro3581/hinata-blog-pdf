# Sakamichi Blog PDF for iOS

日向坂46、櫻坂46、欅坂46、乃木坂46の公式ブログを端末から直接取得し、
PDFまたはZIPとして共有・保存するSwiftUIアプリです。Renderなどの外部サーバーは使用しません。

## 起動方法

1. `SakamichiBlogPDF.xcodeproj` をXcodeで開きます。
2. `SakamichiBlogPDF` ターゲットの Signing & Capabilities でApple Developer Teamを選択します。
3. 必要に応じてBundle Identifierを自分のものへ変更します。
4. iOS 17以降の実機またはシミュレータを選び、Runを実行します。

## プロジェクト再生成

`project.yml` を変更した場合は、`ios` ディレクトリで次を実行します。

```sh
xcodegen generate
```

App Storeで配布する場合は、公式サイトの利用条件とコンテンツの権利を確認してください。

## 広告

Google Mobile Ads SDK 13.5.0とUser Messaging Platform 3.1.0を使用しています。
DebugビルドではGoogle公式テスト広告のみ表示されます。

公開前にAdMobでiOSアプリとバナー広告ユニットを作成し、
`SakamichiBlogPDF/Info.plist`の次の値を置き換えてください。

- `GADApplicationIdentifier`
- `AdMobBannerAdUnitIdentifier`

ReleaseビルドはテストIDのままでは広告を表示しません。
AdMobのPrivacy & messagingで、対象地域向けの同意メッセージも公開してください。

## App Store

提出情報案と作業項目は次のファイルにまとめています。

- `AppStore/metadata-ja.md`
- `AppStore/release-checklist.md`

現在このMacに設定されているPersonal TeamではApp Storeへ提出できません。
Apple Developer Programの有料メンバーシップと配布用署名証明書が必要です。
