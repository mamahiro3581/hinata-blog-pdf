package com.mamahiro3581.sakamichiblogpdf.export

import java.text.Normalizer

fun sanitizeFilename(value: String, fallback: String = "blog", maxLength: Int = 120): String {
    val cleaned = Normalizer.normalize(value, Normalizer.Form.NFKC)
        .replace(Regex("""[\\/:*?"<>|\u0000-\u001f]"""), "_")
        .replace(Regex("""\s+"""), " ")
        .replace(Regex("""[. ]+$"""), "")
        .trim()
    return (cleaned.ifBlank { fallback }).take(maxLength)
}
