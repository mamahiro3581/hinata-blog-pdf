package com.mamahiro3581.sakamichiblogpdf.export

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
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
import java.io.File
import java.io.FileOutputStream
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
            webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
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
            val scaledContentHeight = (webView.contentHeight * webView.scale).toInt()
            val contentHeight = scaledContentHeight
                .takeIf { it > 0 }
                ?: webView.measuredHeight.coerceAtLeast(1)
            webView.layout(0, 0, PDF_PAGE_WIDTH, contentHeight)

            val pageSlices = calculatePageSlices(webView, contentHeight)
            val document = PdfDocument()
            try {
                pageSlices.forEachIndexed { pageIndex, slice ->
                    val pageInfo = PdfDocument.PageInfo.Builder(
                        PDF_PAGE_WIDTH,
                        PDF_PAGE_HEIGHT,
                        pageIndex + 1,
                    ).create()
                    val page = document.startPage(pageInfo)
                    page.canvas.drawColor(Color.WHITE)
                    page.canvas.save()
                    page.canvas.clipRect(0, 0, PDF_PAGE_WIDTH, slice.bottom - slice.top)
                    page.canvas.translate(0f, -slice.top.toFloat())
                    webView.draw(page.canvas)
                    page.canvas.restore()
                    if (pageIndex == pageSlices.lastIndex) {
                        drawSourceFooter(page, article.sourceUrl)
                    }
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

    private fun calculatePageSlices(webView: WebView, contentHeight: Int): List<PageSlice> {
        val slices = mutableListOf<PageSlice>()
        var pageTop = 0
        while (pageTop < contentHeight) {
            val maxBottom = minOf(pageTop + PDF_CONTENT_HEIGHT, contentHeight)
            val pageBottom = if (maxBottom == contentHeight) {
                contentHeight
            } else {
                findSafePageBreak(webView, pageTop, maxBottom)
            }.coerceIn(pageTop + 1, maxBottom)
            slices += PageSlice(pageTop, pageBottom)
            pageTop = pageBottom
        }
        return slices.ifEmpty { listOf(PageSlice(0, 1)) }
    }

    private fun findSafePageBreak(webView: WebView, pageTop: Int, maxBottom: Int): Int {
        val searchTop = maxOf(
            pageTop + MIN_PAGE_CONTENT_HEIGHT,
            maxBottom - PAGE_BREAK_SEARCH_HEIGHT,
        )
        val searchHeight = maxBottom - searchTop
        if (searchHeight < MIN_BLANK_ROW_COUNT) {
            return maxBottom
        }

        val bitmap = Bitmap.createBitmap(PDF_PAGE_WIDTH, searchHeight, Bitmap.Config.ARGB_8888)
        return try {
            val canvas = android.graphics.Canvas(bitmap)
            canvas.drawColor(Color.WHITE)
            canvas.translate(0f, -searchTop.toFloat())
            webView.draw(canvas)

            val pixels = IntArray(PDF_PAGE_WIDTH * searchHeight)
            bitmap.getPixels(pixels, 0, PDF_PAGE_WIDTH, 0, 0, PDF_PAGE_WIDTH, searchHeight)
            var blankRunStart = -1
            var bestBreak = maxBottom

            for (row in 0 until searchHeight) {
                if (isBlankRow(pixels, row * PDF_PAGE_WIDTH)) {
                    if (blankRunStart < 0) {
                        blankRunStart = row
                    }
                } else {
                    if (blankRunStart >= 0 && row - blankRunStart >= MIN_BLANK_ROW_COUNT) {
                        bestBreak = searchTop + (blankRunStart + row) / 2
                    }
                    blankRunStart = -1
                }
            }
            if (blankRunStart >= 0 && searchHeight - blankRunStart >= MIN_BLANK_ROW_COUNT) {
                bestBreak = searchTop + (blankRunStart + searchHeight) / 2
            }
            bestBreak
        } finally {
            bitmap.recycle()
        }
    }

    private fun isBlankRow(pixels: IntArray, rowOffset: Int): Boolean {
        var inkPixels = 0
        for (column in 0 until PDF_PAGE_WIDTH) {
            val pixel = pixels[rowOffset + column]
            if (
                Color.red(pixel) < BLANK_PIXEL_THRESHOLD ||
                Color.green(pixel) < BLANK_PIXEL_THRESHOLD ||
                Color.blue(pixel) < BLANK_PIXEL_THRESHOLD
            ) {
                inkPixels += 1
                if (inkPixels > MAX_INK_PIXELS_PER_BLANK_ROW) {
                    return false
                }
            }
        }
        return true
    }

    private fun drawSourceFooter(page: PdfDocument.Page, sourceUrl: String) {
        val canvas = page.canvas
        val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(223, 228, 234)
            strokeWidth = 1f
        }
        canvas.drawLine(
            SOURCE_FOOTER_MARGIN.toFloat(),
            SOURCE_DIVIDER_Y.toFloat(),
            (PDF_PAGE_WIDTH - SOURCE_FOOTER_MARGIN).toFloat(),
            SOURCE_DIVIDER_Y.toFloat(),
            dividerPaint,
        )

        val sourceText = "Source: $sourceUrl"
        val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(106, 115, 130)
            textSize = SOURCE_TEXT_SIZE
        }
        val layout = StaticLayout.Builder.obtain(
            sourceText,
            0,
            sourceText.length,
            textPaint,
            PDF_PAGE_WIDTH - SOURCE_FOOTER_MARGIN * 2,
        )
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setIncludePad(false)
            .setEllipsize(TextUtils.TruncateAt.END)
            .setMaxLines(SOURCE_MAX_LINES)
            .build()

        canvas.save()
        canvas.translate(
            SOURCE_FOOTER_MARGIN.toFloat(),
            SOURCE_TEXT_TOP.toFloat(),
        )
        layout.draw(canvas)
        canvas.restore()
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
                    font-size: 10pt;
                    line-height: 1.85;
                    word-break: break-word;
                  }
                  .print-shell { max-width: 700px; margin: 0 auto; }
                  .print-kicker {
                    margin: 0 0 7px;
                    color: #2878b8;
                    font-size: 10px;
                    font-weight: 700;
                  }
                  h1 {
                    margin: 0 0 8px;
                    font-size: 24px;
                    line-height: 1.35;
                  }
                  .print-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px 14px;
                    margin: 0 0 20px;
                    color: #626c78;
                    font-size: 11px;
                  }
                  .p-blog-article__head { display: none; }
                  .blog-content p,
                  .c-blog-article__text p { margin: 0; }
                  .blog-content img,
                  .c-blog-article__text img {
                    display: block;
                    width: auto !important;
                    max-width: 75% !important;
                    max-height: 760px !important;
                    height: auto !important;
                    margin: 8px auto;
                    break-inside: avoid;
                    object-fit: contain;
                    border-radius: 2px;
                  }
                  a {
                    color: #1d5f94;
                    text-decoration: underline;
                    overflow-wrap: anywhere;
                  }
                  iframe,
                  video { max-width: 100%; }
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
        const val PDF_CONTENT_HEIGHT = 792
        const val PAGE_BREAK_SEARCH_HEIGHT = PDF_CONTENT_HEIGHT
        const val MIN_PAGE_CONTENT_HEIGHT = 96
        const val MIN_BLANK_ROW_COUNT = 4
        const val MAX_INK_PIXELS_PER_BLANK_ROW = 3
        const val BLANK_PIXEL_THRESHOLD = 248
        const val SOURCE_FOOTER_MARGIN = 18
        const val SOURCE_DIVIDER_Y = 800
        const val SOURCE_TEXT_TOP = 806
        const val SOURCE_MAX_LINES = 3
        const val SOURCE_TEXT_SIZE = 8f
    }

    private data class PageSlice(val top: Int, val bottom: Int)
}
