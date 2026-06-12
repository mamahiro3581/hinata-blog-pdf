import SwiftUI

@main
struct SakamichiBlogPDFApp: App {
    @StateObject private var advertising = AdvertisingManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(advertising)
                .task {
                    advertising.configure()
                }
        }
    }
}
