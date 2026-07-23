package com.mamahiro3581.sakamichiblogpdf.export

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ZipArchiveWriter {
    fun create(files: List<ExportFile>): ByteArray {
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            for (file in files) {
                zip.putNextEntry(ZipEntry(file.filename))
                zip.write(file.bytes)
                zip.closeEntry()
            }
        }
        return output.toByteArray()
    }
}

data class ExportFile(
    val filename: String,
    val bytes: ByteArray,
)
