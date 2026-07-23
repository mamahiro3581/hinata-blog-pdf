package com.mamahiro3581.sakamichiblogpdf.export

import android.app.Activity
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.mamahiro3581.sakamichiblogpdf.BuildConfig
import com.mamahiro3581.sakamichiblogpdf.data.BlogArticle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.FileOutputStream
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PdfExporter(private val activity: Activity) {
    suspend fun render(article: BlogArticle): ByteArray = withContext(Dispatchers.Main) {
        val outputFile = File.createTempFile("sakamichi-blog-", ".pdf", activity.cacheDir)
        try {
            renderToFile(article, outputFile)
            outputFile.readBytes()
        } finally {
            outputFile.delete()
        }
    }

    private suspend fun renderToFile(article: BlogArticle, outputFile: File) {
        suspendCancellableCoroutine { continuation ->
            val webView = WebView(activity)
            var completed = false

            fun cleanup() {
                (webView.parent as? ViewGroup)?.removeView(webView)
                webView.stopLoading()
                webView.destroy()
            }

            fun finish(error: Throwable? = null) {
                if (completed) {
                    return
                }
                completed = true
                cleanup()
                if (error == null) {
                    continuation.resume(Unit)
                } else {
                    continuation.resumeWithException(error)
                }
            }

            continuation.invokeOnCancellation { cleanup() }

            webView.settings.loadsImagesAutomatically = true
            webView.settings.blockNetworkImage = false
            webView.settings.javaScriptEnabled = false
            webView.setBackgroundColor(Color.WHITE)
            webView.alpha = 0f
            webView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) {
                    view.postDelayed({ writePdf(view, article, outputFile, ::finish) }, 1_200)
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (request.isForMainFrame) {
                        finish(IllegalStateException("PDF用ページの読み込みに失敗しました。"))
                    }
                }
            }

            activity.addContentView(webView, ViewGroup.LayoutParams(PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT))
            webView.loadDataWithBaseURL(
                BuildConfig.API_BASE_URL,
                buildPrintHtml(article),
                "text/html",
                "UTF-8",
                null,
            )
        }
    }

    private fun writePdf(
        webView: WebView,
        article: BlogArticle,
        outputFile: File,
        finish: (Throwable?) -> Unit,
    ) {
        runCatching {
            webView.measure(
                View.MeasureSpec.makeMeasureSpec(PDF_PAGE_WIDTH, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            )
            val contentHeight = maxOf(
                webView.measuredHeight,
                (webView.contentHeight * webView.scale).toInt(),
                PDF_PAGE_HEIGHT,
            )
            webView.layout(0, 0, PDF_PAGE_WIDTH, contentHeight)

            val pageCount = ((contentHeight + PDF_PAGE_HEIGHT - 1) / PDF_PAGE_HEIGHT).coerceAtLeast(1)
            val document = PdfDocument()
            try {
                for (pageIndex in 0 until pageCount) {
                    val pageInfo = PdfDocument.PageInfo.Builder(
                        PDF_PAGE_WIDTH,
                        PDF_PAGE_HEIGHT,
                        pageIndex + 1,
                    ).create()
                    val page = document.startPage(pageInfo)
                    page.canvas.drawColor(Color.WHITE)
                    page.canvas.translate(0f, (-pageIndex * PDF_PAGE_HEIGHT).toFloat())
                    webView.draw(page.canvas)
                    document.finishPage(page)
                }
                FileOutputStream(outputFile).use { document.writeTo(it) }
            } finally {
                document.close()
            }
        }.fold(
            onSuccess = { finish(null) },
            onFailure = { finish(it) },
        )
    }

    private fun buildPrintHtml(article: BlogArticle): String {
        return """
            <!doctype html>
            <html lang="ja">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  @page { size: A4; margin: 10mm 10mm 12mm; }
                  * { box-sizing: border-box; }
                  body {
                    margin: 0;
                    background: #ffffff;
                    color: #222831;
                    font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif;
                    font-size: 14px;
                    line-height: 1.85;
                    word-break: break-word;
                  }
                  .print-shell { max-width: 700px; margin: 0 auto; }
                  .print-kicker {
                    margin: 0 0 7px;
                    color: #2878b8;
                    font-size: 11px;
                    font-weight: 700;
                  }
                  h1 {
                    margin: 0 0 8px;
                    font-size: 25px;
                    line-height: 1.35;
                  }
                  .print-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px 14px;
                    margin: 0 0 20px;
                    color: #626c78;
                    font-size: 12px;
                  }
                  .p-blog-article__head { display: none; }
                  .blog-content p,
                  .c-blog-article__text p { margin: 0; }
                  .blog-content img,
                  .c-blog-article__text img {
                    display: block;
                    width: auto !important;
                    max-width: 25% !important;
                    height: auto !important;
                    margin: 8px auto;
                    break-inside: avoid;
                    border-radius: 2px;
                  }
                  a {
                    color: #1d5f94;
                    text-decoration: underline;
                    overflow-wrap: anywhere;
                  }
                  iframe,
                  video { max-width: 100%; }
                  .print-source {
                    margin-top: 26px;
                    padding-top: 10px;
                    border-top: 1px solid #dfe4ea;
                    color: #6a7382;
                    font-size: 10px;
                    overflow-wrap: anywhere;
                  }
                </style>
              </head>
              <body>
                <main class="print-shell">
                  <p class="print-kicker">${escapeHtml(article.groupLabel)} 公式ブログ</p>
                  <h1>${escapeHtml(article.title)}</h1>
                  <div class="print-meta">
                    <span>${escapeHtml(article.memberName)}</span>
                    <span>${escapeHtml(article.date)}</span>
                  </div>
                  <div class="blog-content group-${escapeHtml(article.group.id)}">${article.articleHtml}</div>
                  <div class="print-source">Source: ${escapeHtml(article.sourceUrl)}</div>
                </main>
              </body>
            </html>
        """.trimIndent()
    }

    private fun escapeHtml(value: String): String = value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")

    private companion object {
        const val PDF_PAGE_WIDTH = 595
        const val PDF_PAGE_HEIGHT = 842
    }
}
