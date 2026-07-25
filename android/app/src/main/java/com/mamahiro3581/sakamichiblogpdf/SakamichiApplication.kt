package com.mamahiro3581.sakamichiblogpdf

import android.app.Application
import android.webkit.WebView

class SakamichiApplication : Application() {
    override fun onCreate() {
        WebView.enableSlowWholeDocumentDraw()
        super.onCreate()
    }
}
