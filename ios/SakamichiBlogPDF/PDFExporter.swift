import Foundation
import UIKit
import WebKit

enum PDFExportError: LocalizedError {
    case loadFailed
    case renderFailed

    var errorDescription: String? {
        switch self {
        case .loadFailed:
            "ブログ本文の読み込みに失敗しました。"
        case .renderFailed:
            "PDFの生成に失敗しました。"
        }
    }
}

@MainActor
final class PDFExporter: NSObject, WKNavigationDelegate {
    private var loadContinuation: CheckedContinuation<Void, Error>?

    func render(html: String, baseURL: URL) async throws -> Data {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 760, height: 1_080),
            configuration: configuration
        )
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .white

        try await withCheckedThrowingContinuation { continuation in
            loadContinuation = continuation
            webView.loadHTMLString(html, baseURL: baseURL)
        }

        await waitForImages(in: webView)
        let formatter = webView.viewPrintFormatter()
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(formatter, startingAtPageAt: 0)

        let a4 = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
        let printable = a4.insetBy(dx: 28.3, dy: 28.3)
        renderer.setValue(NSValue(cgRect: a4), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))

        guard renderer.numberOfPages > 0 else {
            throw PDFExportError.renderFailed
        }

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, a4, nil)

        for page in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: page, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadContinuation?.resume()
        loadContinuation = nil
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        loadContinuation?.resume(throwing: error)
        loadContinuation = nil
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        loadContinuation?.resume(throwing: error)
        loadContinuation = nil
    }

    private func waitForImages(in webView: WKWebView) async {
        let script = """
        new Promise(resolve => {
          const images = Array.from(document.images);
          if (images.length === 0) { resolve(true); return; }
          Promise.all(images.map(image => {
            if (image.complete) return Promise.resolve();
            return new Promise(done => {
              image.addEventListener('load', done, { once: true });
              image.addEventListener('error', done, { once: true });
              setTimeout(done, 10000);
            });
          })).then(() => resolve(true));
        });
        """
        _ = try? await webView.evaluateJavaScript(script)
    }
}
