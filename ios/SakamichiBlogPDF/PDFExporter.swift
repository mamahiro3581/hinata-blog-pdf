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
    private var renderingWebView: WKWebView?

    func render(html: String, baseURL: URL) async throws -> Data {
        let webView = makeOrReuseWebView()

        do {
            try await withCheckedThrowingContinuation { continuation in
                loadContinuation = continuation
                webView.loadHTMLString(html, baseURL: baseURL)
            }
        } catch {
            discard(webView)
            throw error
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
            discard(webView)
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

    private func makeOrReuseWebView() -> WKWebView {
        if let renderingWebView {
            return renderingWebView
        }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 760, height: 1_080),
            configuration: configuration
        )
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .white
        renderingWebView = webView
        return webView
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
        discard(webView)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        loadContinuation?.resume(throwing: error)
        loadContinuation = nil
        discard(webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loadContinuation?.resume(throwing: PDFExportError.loadFailed)
        loadContinuation = nil
        discard(webView)
    }

    private func discard(_ webView: WKWebView) {
        if renderingWebView === webView {
            renderingWebView = nil
        }
    }

    private func waitForImages(in webView: WKWebView) async {
        let script = """
        new Promise(resolve => {
          const images = Array.from(document.images);
          if (images.length === 0) { resolve(true); return; }
          Promise.all(images.map(image => {
            if (image.complete) {
              if (image.naturalWidth === 0) image.remove();
              return Promise.resolve();
            }
            return new Promise(done => {
              image.addEventListener('load', done, { once: true });
              image.addEventListener('error', () => { image.remove(); done(); }, { once: true });
              setTimeout(() => {
                if (image.naturalWidth === 0) image.remove();
                done();
              }, 10000);
            });
          })).then(() => resolve(true));
        });
        """
        _ = try? await webView.evaluateJavaScript(script)
    }
}
