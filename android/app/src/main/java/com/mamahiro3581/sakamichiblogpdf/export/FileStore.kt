package com.mamahiro3581.sakamichiblogpdf.export

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import java.io.File

class FileStore(private val context: Context) {
    fun saveBytes(filename: String, mimeType: String, bytes: ByteArray): SavedFile {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveToDownloads(filename, mimeType, bytes)
        } else {
            saveToAppExternalFiles(filename, mimeType, bytes)
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveToDownloads(filename: String, mimeType: String, bytes: ByteArray): SavedFile {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/SakamichiBlogPDF")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: error("保存先を作成できませんでした。")
        try {
            resolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: error("保存先を開けませんでした。")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            return SavedFile(uri, filename, mimeType)
        } catch (error: Throwable) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    private fun saveToAppExternalFiles(filename: String, mimeType: String, bytes: ByteArray): SavedFile {
        val directory = File(context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "SakamichiBlogPDF")
        directory.mkdirs()
        val file = File(directory, filename)
        file.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return SavedFile(uri, filename, mimeType)
    }
}

data class SavedFile(
    val uri: Uri,
    val filename: String,
    val mimeType: String,
)
