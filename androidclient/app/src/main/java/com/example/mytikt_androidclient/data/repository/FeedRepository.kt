package com.example.mytikt_androidclient.data.repository

import com.example.mytikt_androidclient.data.api.ApiService
import com.example.mytikt_androidclient.data.model.MediaItem
import com.example.mytikt_androidclient.data.model.MediaListResponse
import com.example.mytikt_androidclient.data.model.TagOperationRequest
import java.io.IOException

class FeedRepository(
    private val api: ApiService,
    private val apiBase: String
) {
    @Volatile
    private var sessionSeed: String? = null

    @Synchronized
    fun invalidateSession() {
        sessionSeed = null
    }

    suspend fun ensureSession(seed: String? = null): String {
        val cached = sessionSeed
        if (cached != null) return cached
        val resp = api.createSession(seed)
        sessionSeed = resp.sessionSeed
        return resp.sessionSeed
    }

    suspend fun loadInitialPage(): FeedPage {
        val seed = ensureSession()
        val resp = api.getMediaResourceList(seed = seed, offset = 0, limit = DEFAULT_PAGE_SIZE)
        return resp.toFeedPage()
    }

    suspend fun loadMore(offset: Int): FeedPage {
        val seed = ensureSession()
        val resp = api.getMediaResourceList(seed = seed, offset = offset, limit = DEFAULT_PAGE_SIZE)
        return resp.toFeedPage()
    }

    suspend fun setTag(mediaId: Long, tag: String, value: Boolean) {
        if (value) {
            api.addTag(TagOperationRequest(mediaId = mediaId, tag = tag))
        } else {
            val resp = api.removeTag(TagOperationRequest(mediaId = mediaId, tag = tag))
            // 404 表示没有该标签，不算错误
            if (!resp.isSuccessful && resp.code() != 404) {
                throw IOException("removeTag failed: ${resp.code()}")
            }
        }
    }

    suspend fun deleteMedia(mediaId: Long, deleteFile: Boolean = true) {
        val resp = api.deleteMedia(mediaId = mediaId, deleteFile = if (deleteFile) 1 else 0)
        if (!resp.isSuccessful && resp.code() != 204) {
            throw IOException("deleteMedia failed: ${resp.code()}")
        }
    }

    companion object {
        private const val DEFAULT_PAGE_SIZE = 20
    }

    private fun toAbsolute(path: String?): String? {
        if (path.isNullOrBlank()) return null
        val trimmedBase = apiBase.trimEnd('/')
        return when {
            path.startsWith("http://", ignoreCase = true) -> path
            path.startsWith("https://", ignoreCase = true) -> path
            path.startsWith("/") -> "$trimmedBase$path"
            else -> "$trimmedBase/$path"
        }
    }

    private fun toAbsolute(item: MediaItem): MediaItem {
        val absoluteResource = toAbsolute(item.resourceUrl) ?: item.resourceUrl
        val absoluteUrl = item.url?.let { toAbsolute(it) } ?: absoluteResource
        val absoluteThumb = item.thumbnailUrl?.let { toAbsolute(it) }
        return item.copy(
            resourceUrl = absoluteResource,
            url = absoluteUrl,
            thumbnailUrl = absoluteThumb
        )
    }

    private fun mapItems(items: List<MediaItem>): List<MediaItem> =
        items.map { toAbsolute(it) }

    private fun calculateNextOffset(resp: MediaListResponse): Int =
        resp.offset + resp.items.size

    private fun MediaListResponse.toFeedPage(): FeedPage = FeedPage(
        items = mapItems(items),
        nextOffset = calculateNextOffset(this),
        hasMore = hasMore
    )
}

data class FeedPage(
    val items: List<MediaItem>,
    val nextOffset: Int,
    val hasMore: Boolean
)
