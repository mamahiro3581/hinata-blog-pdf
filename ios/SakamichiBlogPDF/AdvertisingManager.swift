import Combine
import GoogleMobileAds
import UIKit
import UserMessagingPlatform

@MainActor
final class AdvertisingManager: NSObject, ObservableObject, FullScreenContentDelegate {
    static let shared = AdvertisingManager()

    @Published private(set) var canShowAds = false
    @Published private(set) var privacyOptionsRequired = false
    @Published private(set) var statusMessage: String?

    private var didRequestConsent = false
    private var didStartSDK = false
    private var interstitial: InterstitialAd?
    private var dismissalContinuation: CheckedContinuation<Void, Never>?

    private override init() {}

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
        Task { await preloadInterstitial() }
    }

    /// Preloads an ad so a long export can start without adding an ad-network wait.
    private func preloadInterstitial() async {
        guard interstitial == nil, let adUnitID = AdConfiguration.interstitialAdUnitID else {
            return
        }

        do {
            let ad = try await InterstitialAd.load(with: adUnitID, request: Request())
            ad.fullScreenContentDelegate = self
            interstitial = ad
        } catch {
            #if DEBUG
            print("AdMob interstitial error: \(error.localizedDescription)")
            #endif
        }
    }

    /// Shows a loaded interstitial for larger exports, then lets the export continue.
    @discardableResult
    func presentInterstitialIfNeeded(for selectedCount: Int) async -> Bool {
        guard selectedCount >= 5, canShowAds, let ad = interstitial else {
            return false
        }
        guard let presenter = topViewController() else {
            interstitial = nil
            Task { await preloadInterstitial() }
            return false
        }

        do {
            try ad.canPresent(from: presenter)
        } catch {
            interstitial = nil
            Task { await preloadInterstitial() }
            return false
        }

        interstitial = nil
        await withCheckedContinuation { continuation in
            dismissalContinuation = continuation
            ad.fullScreenContentDelegate = self
            ad.present(from: presenter)
        }
        Task { await preloadInterstitial() }
        return true
    }

    func ad(
        _ ad: FullScreenPresentingAd,
        didFailToPresentFullScreenContentWithError error: Error
    ) {
        dismissalContinuation?.resume()
        dismissalContinuation = nil
        Task { await preloadInterstitial() }
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        dismissalContinuation?.resume()
        dismissalContinuation = nil
        Task { await preloadInterstitial() }
    }

    private func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard let root = scene?.windows.first(where: \.isKeyWindow)?.rootViewController else {
            return nil
        }
        return topViewController(from: root)
    }

    private func topViewController(from controller: UIViewController) -> UIViewController {
        if let presented = controller.presentedViewController {
            return topViewController(from: presented)
        }
        if let navigation = controller as? UINavigationController,
           let visible = navigation.visibleViewController {
            return topViewController(from: visible)
        }
        if let tab = controller as? UITabBarController,
           let selected = tab.selectedViewController {
            return topViewController(from: selected)
        }
        return controller
    }
}

enum AdConfiguration {
    static let testBannerAdUnitID = "ca-app-pub-3940256099942544/2435281174"
    static let testInterstitialAdUnitID = "ca-app-pub-3940256099942544/4411468910"

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

    static var interstitialAdUnitID: String? {
        #if DEBUG
        return testInterstitialAdUnitID
        #else
        guard
            let value = Bundle.main.object(
                forInfoDictionaryKey: "AdMobInterstitialAdUnitIdentifier"
            ) as? String,
            value.hasPrefix("ca-app-pub-"),
            value != testInterstitialAdUnitID,
            !value.contains("REPLACE")
        else {
            return nil
        }
        return value
        #endif
    }
}
