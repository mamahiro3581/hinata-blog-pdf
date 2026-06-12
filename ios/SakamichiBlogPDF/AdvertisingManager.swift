import Combine
import GoogleMobileAds
import UserMessagingPlatform

@MainActor
final class AdvertisingManager: ObservableObject {
    static let shared = AdvertisingManager()

    @Published private(set) var canShowAds = false
    @Published private(set) var privacyOptionsRequired = false
    @Published private(set) var statusMessage: String?

    private var didRequestConsent = false
    private var didStartSDK = false

    private init() {}

    func configure() {
        guard !didRequestConsent else { return }
        didRequestConsent = true

        let parameters = RequestParameters()
        ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { [weak self] error in
            guard let self else { return }

            Task { @MainActor in
                self.privacyOptionsRequired =
                    ConsentInformation.shared.privacyOptionsRequirementStatus == .required

                if let error {
                    self.statusMessage = "広告の同意情報を更新できませんでした: \(error.localizedDescription)"
                    self.startSDKIfAllowed()
                    return
                }

                do {
                    try await ConsentForm.loadAndPresentIfRequired(from: nil)
                } catch {
                    self.statusMessage = "広告の同意画面を表示できませんでした: \(error.localizedDescription)"
                }

                self.privacyOptionsRequired =
                    ConsentInformation.shared.privacyOptionsRequirementStatus == .required
                self.startSDKIfAllowed()
            }
        }
    }

    func presentPrivacyOptions() async {
        do {
            try await ConsentForm.presentPrivacyOptionsForm(from: nil)
            privacyOptionsRequired =
                ConsentInformation.shared.privacyOptionsRequirementStatus == .required
            startSDKIfAllowed()
        } catch {
            statusMessage = "プライバシー設定を表示できませんでした: \(error.localizedDescription)"
        }
    }

    private func startSDKIfAllowed() {
        guard ConsentInformation.shared.canRequestAds, !didStartSDK else { return }
        guard AdConfiguration.bannerAdUnitID != nil else {
            statusMessage = "公開用のAdMob広告ユニットIDが未設定です。"
            return
        }

        didStartSDK = true
        MobileAds.shared.start()
        canShowAds = true
    }
}

enum AdConfiguration {
    static let testBannerAdUnitID = "ca-app-pub-3940256099942544/2435281174"

    static var bannerAdUnitID: String? {
        #if DEBUG
        return testBannerAdUnitID
        #else
        guard
            let value = Bundle.main.object(
                forInfoDictionaryKey: "AdMobBannerAdUnitIdentifier"
            ) as? String,
            value.hasPrefix("ca-app-pub-"),
            value != testBannerAdUnitID,
            !value.contains("REPLACE")
        else {
            return nil
        }
        return value
        #endif
    }
}
