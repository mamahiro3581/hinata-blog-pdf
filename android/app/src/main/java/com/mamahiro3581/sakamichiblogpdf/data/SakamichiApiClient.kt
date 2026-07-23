package com.mamahiro3581.sakamichiblogpdf.data

import android.net.Uri
import com.mamahiro3581.sakamichiblogpdf.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class SakamichiApiClient(
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    suspend fun fetchMembers(group: BlogGroup): List<BlogMember> {
        val json = getJson("/api/members", mapOf("group" to group.id))
        val members = json.optJSONArray("members") ?: return emptyList()
        return buildList {
            for (index in 0 until members.length()) {
                val item = members.optJSONObject(index) ?: continue
                val id = item.optString("id").takeIf { it.isNotBlank() } ?: continue
                add(
                    BlogMember(
                        id = id,
                        name = item.optString("name"),
                        updated = item.optString("updated"),
                        url = item.optString("url"),
                    ),
                )
            }
        }
    }

    suspend fun fetchBlogs(
        group: BlogGroup,
        memberIds: List<String>,
        onProgress: suspend (memberIndex: Int, totalMembers: Int, loadedCount: Int) -> Unit,
    ): List<BlogPost> {
        val posts = mutableListOf<BlogPost>()
        for ((memberIndex, memberId) in memberIds.withIndex()) {
            var startPage: Int? = 0
            while (startPage != null) {
                onProgress(memberIndex + 1, memberIds.size, posts.size)
                val params = mutableMapOf(
                    "group" to group.id,
                    "member" to memberId,
                )
                if (startPage > 0) {
                    params["startPage"] = startPage.toString()
                }
                val page = fetchBlogPage(group, memberId, params)
                posts += page.blogs
                startPage = page.nextPage
            }
        }
        return posts
            .distinctBy { it.id }
            .sortedWith(compareByDescending<BlogPost> { it.id.toLongOrNull() ?: 0L }.thenByDescending { it.id })
    }

    suspend fun fetchArticle(post: BlogPost): BlogArticle {
        val json = getJson(
            "/api/article",
            mapOf(
                "group" to post.group.id,
                "id" to post.id,
                "title" to post.title,
                "date" to post.date,
                "memberName" to post.memberName,
            ),
        )
        return BlogArticle(
            id = json.optString("id", post.id),
            group = BlogGroup.fromId(json.optString("group", post.group.id)),
            groupLabel = json.optString("groupLabel", post.group.label),
            title = json.optString("title", post.title),
            memberName = json.optString("memberName", post.memberName),
            date = json.optString("date", post.date),
            sourceUrl = json.optString("sourceUrl", post.url),
            articleHtml = json.optString("article"),
        )
    }

    private suspend fun fetchBlogPage(
        group: BlogGroup,
        memberId: String,
        params: Map<String, String>,
    ): BlogPage {
        val json = getJson("/api/blogs", params)
        val blogs = json.optJSONArray("blogs") ?: return BlogPage(emptyList(), null)
        val posts = buildList {
            for (index in 0 until blogs.length()) {
                val item = blogs.optJSONObject(index) ?: continue
                val id = item.optString("id").takeIf { it.isNotBlank() } ?: continue
                add(
                    BlogPost(
                        id = id,
                        title = item.optString("title"),
                        date = item.optString("date"),
                        memberId = item.optString("memberId", item.optString("memberID", memberId)),
                        memberName = item.optString("memberName"),
                        group = BlogGroup.fromId(item.optString("group", group.id)),
                        url = item.optString("url"),
                        imageUrl = item.optString("imageUrl", item.optString("imageURL")).takeIf { it.isNotBlank() },
                    ),
                )
            }
        }
        val nextPage = if (json.has("nextPage") && !json.isNull("nextPage")) {
            json.optInt("nextPage")
        } else {
            null
        }
        return BlogPage(posts, nextPage)
    }

    private suspend fun getJson(path: String, params: Map<String, String>): JSONObject =
        withContext(Dispatchers.IO) {
            var lastError: Throwable? = null
            repeat(3) { attempt ->
                try {
                    val connection = buildUrl(path, params).openConnection() as HttpURLConnection
                    connection.requestMethod = "GET"
                    connection.connectTimeout = 15_000
                    connection.readTimeout = 30_000
                    connection.setRequestProperty("Accept", "application/json")
                    connection.setRequestProperty("User-Agent", USER_AGENT)

                    val status = connection.responseCode
                    val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                        ?.bufferedReader(Charsets.UTF_8)
                        ?.use { it.readText() }
                        .orEmpty()

                    if (status !in 200..299) {
                        val message = body.takeIf { it.isNotBlank() }
                            ?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() }
                            ?.takeIf { it.isNotBlank() }
                            ?: "通信に失敗しました。($status)"
                        throw IOException(message)
                    }
                    return@withContext JSONObject(body)
                } catch (error: Throwable) {
                    lastError = error
                    if (attempt == 2) {
                        throw error
                    }
                }
            }
            throw lastError ?: IOException("通信に失敗しました。")
        }

    private fun buildUrl(path: String, params: Map<String, String>): URL {
        val builder = Uri.parse(baseUrl)
            .buildUpon()
            .appendEncodedPath(path.trimStart('/'))
        params.forEach { (key, value) ->
            builder.appendQueryParameter(key, value)
        }
        builder.appendQueryParameter("__appVersion", CLIENT_VERSION)
        return URL(builder.build().toString())
    }

    private companion object {
        const val CLIENT_VERSION = "android-2026-07-23"
        const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) SakamichiBlogPDF/1.0"
    }
}
