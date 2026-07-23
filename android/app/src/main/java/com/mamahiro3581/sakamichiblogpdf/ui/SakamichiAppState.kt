package com.mamahiro3581.sakamichiblogpdf.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.mamahiro3581.sakamichiblogpdf.data.BlogArticle
import com.mamahiro3581.sakamichiblogpdf.data.BlogGroup
import com.mamahiro3581.sakamichiblogpdf.data.BlogMember
import com.mamahiro3581.sakamichiblogpdf.data.BlogPost
import com.mamahiro3581.sakamichiblogpdf.data.SakamichiApiClient
import com.mamahiro3581.sakamichiblogpdf.export.ExportFile
import com.mamahiro3581.sakamichiblogpdf.export.FileStore
import com.mamahiro3581.sakamichiblogpdf.export.PdfExporter
import com.mamahiro3581.sakamichiblogpdf.export.SavedFile
import com.mamahiro3581.sakamichiblogpdf.export.ZipArchiveWriter
import com.mamahiro3581.sakamichiblogpdf.export.sanitizeFilename
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SakamichiAppState(
    private val apiClient: SakamichiApiClient,
    private val pdfExporter: PdfExporter,
    private val fileStore: FileStore,
    private val onSavedFile: (SavedFile) -> Unit,
) {
    var group by mutableStateOf(BlogGroup.Hinata)
    var members by mutableStateOf<List<BlogMember>>(emptyList())
    var selectedMemberIds by mutableStateOf<Set<String>>(emptySet())
    var memberQuery by mutableStateOf("")
    var blogs by mutableStateOf<List<BlogPost>>(emptyList())
    var selectedBlogIds by mutableStateOf<Set<String>>(emptySet())
    var blogPageSize by mutableStateOf(10)
    var currentBlogPage by mutableStateOf(1)
    var statusMessage by mutableStateOf("準備中")
    var errorMessage by mutableStateOf<String?>(null)
    var isLoadingMembers by mutableStateOf(false)
    var isLoadingBlogs by mutableStateOf(false)
    var isExporting by mutableStateOf(false)

    val isBusy: Boolean
        get() = isLoadingMembers || isLoadingBlogs || isExporting

    val filteredMembers: List<BlogMember>
        get() {
            val query = memberQuery.trim()
            return if (query.isBlank()) {
                members
            } else {
                members.filter { it.name.contains(query, ignoreCase = true) }
            }
        }

    val selectedMemberLabel: String
        get() {
            val selected = members.filter { selectedMemberIds.contains(it.id) }
            return when {
                selected.isEmpty() -> "メンバーを選択"
                selected.size == 1 -> selected.first().name
                selected.size <= 3 -> selected.joinToString("、") { it.name }
                else -> "${selected.take(3).joinToString("、") { it.name }} ほか${selected.size - 3}名"
            }
        }

    val totalBlogPages: Int
        get() = ((blogs.size + blogPageSize - 1) / blogPageSize).coerceAtLeast(1)

    val currentPageBlogs: List<BlogPost>
        get() = blogs.drop((currentBlogPage - 1) * blogPageSize).take(blogPageSize)

    fun toggleMember(member: BlogMember) {
        selectedMemberIds = if (selectedMemberIds.contains(member.id)) {
            selectedMemberIds - member.id
        } else {
            selectedMemberIds + member.id
        }
    }

    fun selectFilteredMembers() {
        selectedMemberIds = selectedMemberIds + filteredMembers.map { it.id }
    }

    fun clearMembers() {
        selectedMemberIds = emptySet()
    }

    fun toggleBlog(blog: BlogPost) {
        selectedBlogIds = if (selectedBlogIds.contains(blog.id)) {
            selectedBlogIds - blog.id
        } else {
            selectedBlogIds + blog.id
        }
    }

    fun selectAllVisibleBlogs() {
        selectedBlogIds = selectedBlogIds + currentPageBlogs.map { it.id }
    }

    fun clearSelectedBlogs() {
        selectedBlogIds = emptySet()
    }

    fun setBlogPageSize(size: Int) {
        blogPageSize = size
        currentBlogPage = 1
        selectedBlogIds = emptySet()
    }

    fun setBlogPage(page: Int) {
        val nextPage = page.coerceIn(1, totalBlogPages)
        if (nextPage != currentBlogPage) {
            currentBlogPage = nextPage
            selectedBlogIds = emptySet()
        }
    }

    suspend fun changeGroup(nextGroup: BlogGroup) {
        if (nextGroup == group || isBusy) {
            return
        }
        group = nextGroup
        members = emptyList()
        selectedMemberIds = emptySet()
        memberQuery = ""
        blogs = emptyList()
        selectedBlogIds = emptySet()
        currentBlogPage = 1
        loadMembers()
    }

    suspend fun loadMembers() {
        isLoadingMembers = true
        errorMessage = null
        statusMessage = "${group.label} 取得中"
        try {
            members = apiClient.fetchMembers(group)
            selectedMemberIds = emptySet()
            statusMessage = "準備完了"
        } catch (error: Throwable) {
            errorMessage = error.message ?: "メンバー取得に失敗しました。"
            statusMessage = "取得失敗"
        } finally {
            isLoadingMembers = false
        }
    }

    suspend fun fetchBlogs() {
        val memberIds = selectedMemberIds.toList()
        if (memberIds.isEmpty()) {
            return
        }
        isLoadingBlogs = true
        errorMessage = null
        blogs = emptyList()
        selectedBlogIds = emptySet()
        currentBlogPage = 1
        statusMessage = "${group.label} 全ブログ取得中"
        try {
            blogs = apiClient.fetchBlogs(group, memberIds) { memberIndex, totalMembers, loadedCount ->
                statusMessage = "${group.label} ${memberIndex}/${totalMembers}人目 ${loadedCount}件取得"
            }
            statusMessage = "${blogs.size}件取得"
        } catch (error: Throwable) {
            errorMessage = error.message ?: "ブログ取得に失敗しました。"
            statusMessage = "取得失敗"
        } finally {
            isLoadingBlogs = false
        }
    }

    suspend fun exportSelectedBlogs() {
        val selected = blogs.filter { selectedBlogIds.contains(it.id) }
        if (selected.isEmpty()) {
            return
        }
        if (selected.size > 60) {
            errorMessage = "一度に保存できるブログは60件までです。"
            return
        }

        isExporting = true
        errorMessage = null
        statusMessage = "PDF作成中 0/${selected.size}"
        try {
            val files = mutableListOf<ExportFile>()
            val usedNames = mutableSetOf<String>()
            for ((index, post) in selected.withIndex()) {
                statusMessage = "PDF作成中 ${index + 1}/${selected.size}"
                val article = apiClient.fetchArticle(post)
                val bytes = pdfExporter.render(article)
                var filename = pdfFilename(article, index)
                var suffix = 2
                while (usedNames.contains(filename)) {
                    filename = pdfFilename(
                        article.copy(title = "${article.title.ifBlank { "blog-${index + 1}" }} ($suffix)"),
                        index,
                    )
                    suffix += 1
                }
                usedNames += filename
                files += ExportFile(filename, bytes)
            }

            val saved = if (files.size == 1) {
                withContext(Dispatchers.IO) {
                    fileStore.saveBytes(files.first().filename, "application/pdf", files.first().bytes)
                }
            } else {
                statusMessage = "ZIP作成中"
                val zipBytes = withContext(Dispatchers.IO) { ZipArchiveWriter().create(files) }
                withContext(Dispatchers.IO) {
                    fileStore.saveBytes(zipFilename(selected), "application/zip", zipBytes)
                }
            }
            statusMessage = "保存完了"
            onSavedFile(saved)
        } catch (error: Throwable) {
            errorMessage = error.message ?: "保存に失敗しました。"
            statusMessage = "保存失敗"
        } finally {
            isExporting = false
        }
    }

    private fun pdfFilename(article: BlogArticle, index: Int): String {
        val parts = listOf(article.date, article.memberName, article.title).filter { it.isNotBlank() }
        return "${sanitizeFilename(parts.joinToString("_"), "blog-${index + 1}")}.pdf"
    }

    private fun zipFilename(posts: List<BlogPost>): String {
        val memberNames = posts.map { it.memberName }.filter { it.isNotBlank() }.distinct()
        val memberLabel = if (memberNames.size <= 3) {
            memberNames.joinToString("_")
        } else {
            "${memberNames.take(3).joinToString("_")}_ほか${memberNames.size - 3}名"
        }
        val date = SimpleDateFormat("yyyy-MM-dd", Locale.JAPAN).format(Date())
        return "Sakamichi_Blog_PDF_${sanitizeFilename(memberLabel, "members")}_$date.zip"
    }
}
