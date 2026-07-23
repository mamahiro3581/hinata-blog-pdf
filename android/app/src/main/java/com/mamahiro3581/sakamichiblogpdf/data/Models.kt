package com.mamahiro3581.sakamichiblogpdf.data

enum class BlogGroup(
    val id: String,
    val label: String,
    val officialUrl: String,
    val colorArgb: Long,
) {
    Hinata("hinata", "日向坂46", "https://www.hinatazaka46.com/s/official/?ima=0000", 0xFF7CC7E8),
    Sakura("sakura", "櫻坂46", "https://sakurazaka46.com/s/s46/?ima=0335", 0xFFF19DB5),
    Keyaki("keyaki", "欅坂46", "https://www.keyakizaka46.com/s/k46o/diary/member?ima=0000", 0xFF5EB954),
    Nogi("nogi", "乃木坂46", "https://sp.nogizaka46.com/", 0xFF812990);

    companion object {
        fun fromId(id: String): BlogGroup = values().firstOrNull { it.id == id } ?: Hinata
    }
}

data class BlogMember(
    val id: String,
    val name: String,
    val updated: String,
    val url: String,
)

data class BlogPost(
    val id: String,
    val title: String,
    val date: String,
    val memberId: String,
    val memberName: String,
    val group: BlogGroup,
    val url: String,
    val imageUrl: String?,
)

data class BlogArticle(
    val id: String,
    val group: BlogGroup,
    val groupLabel: String,
    val title: String,
    val memberName: String,
    val date: String,
    val sourceUrl: String,
    val articleHtml: String,
)

data class BlogPage(
    val blogs: List<BlogPost>,
    val nextPage: Int?,
)
