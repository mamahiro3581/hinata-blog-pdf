package com.mamahiro3581.sakamichiblogpdf

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import com.mamahiro3581.sakamichiblogpdf.ads.AdvertisingManager
import com.mamahiro3581.sakamichiblogpdf.data.SakamichiApiClient
import com.mamahiro3581.sakamichiblogpdf.export.FileStore
import com.mamahiro3581.sakamichiblogpdf.export.PdfExporter
import com.mamahiro3581.sakamichiblogpdf.export.SavedFile
import com.mamahiro3581.sakamichiblogpdf.ui.SakamichiAppState
import com.mamahiro3581.sakamichiblogpdf.ui.SakamichiBlogPdfApp

class MainActivity : ComponentActivity() {
    private lateinit var advertisingManager: AdvertisingManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        advertisingManager = AdvertisingManager(this)
        advertisingManager.requestConsentAndStartAds()

        setContent {
            val state = remember {
                SakamichiAppState(
                    apiClient = SakamichiApiClient(),
                    pdfExporter = PdfExporter(this),
                    fileStore = FileStore(applicationContext),
                    onSavedFile = ::shareSavedFile,
                )
            }
            SakamichiBlogPdfApp(state, advertisingManager)
        }
    }

    private fun shareSavedFile(file: SavedFile) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = file.mimeType
            putExtra(Intent.EXTRA_STREAM, file.uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(intent, "保存先を選択"))
    }
}
