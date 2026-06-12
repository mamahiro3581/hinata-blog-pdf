import GoogleMobileAds
import SwiftUI

struct AdBannerSlot: View {
    @State private var isLoaded = false

    var body: some View {
        ZStack(alignment: .top) {
            if isLoaded {
                Divider()
            }

            GeometryReader { proxy in
                let width = max(320, proxy.size.width)
                let adSize = largeAnchoredAdaptiveBanner(width: width)

                BannerViewContainer(adSize: adSize, isLoaded: $isLoaded)
                    .frame(width: adSize.size.width, height: adSize.size.height)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(height: isLoaded ? 100 : 1)
        .clipped()
        .background(Color(uiColor: .systemBackground))
        .accessibilityLabel("広告")
    }
}

private struct BannerViewContainer: UIViewRepresentable {
    let adSize: AdSize
    @Binding var isLoaded: Bool

    func makeUIView(context: Context) -> BannerView {
        let banner = BannerView(adSize: adSize)
        banner.adUnitID = AdConfiguration.bannerAdUnitID
        banner.delegate = context.coordinator
        banner.load(Request())
        return banner
    }

    func updateUIView(_ banner: BannerView, context: Context) {
        if banner.adSize.size != adSize.size {
            banner.adSize = adSize
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoaded: $isLoaded)
    }

    final class Coordinator: NSObject, BannerViewDelegate {
        private var isLoaded: Binding<Bool>

        init(isLoaded: Binding<Bool>) {
            self.isLoaded = isLoaded
        }

        func bannerViewDidReceiveAd(_ bannerView: BannerView) {
            isLoaded.wrappedValue = true
        }

        func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) {
            isLoaded.wrappedValue = false
            #if DEBUG
            print("AdMob banner error: \(error.localizedDescription)")
            #endif
        }
    }
}
