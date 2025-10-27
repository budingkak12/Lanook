package com.example.androidclient.data.paging

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.data.remote.ApiService
import com.example.androidclient.data.repository.SessionRepository
import com.example.androidclient.di.NetworkModule

private fun String?.toAbsoluteUrl(): String? {
    if (this == null) return null
    if (startsWith("http://") || startsWith("https://")) return this
    val base = NetworkModule.currentBaseUrl()
    return if (startsWith("/")) base + this else "$base/$this"
}

class ThumbnailPagingSource(
    private val api: ApiService,
    private val sessionRepository: SessionRepository
) : PagingSource<Int, MediaItem>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, MediaItem> {
        // 防御：避免出现负偏移导致后端 422
        val raw = params.key ?: 0
        val offset = if (raw < 0) 0 else raw
        return try {
            val seed = sessionRepository.seed()
            val response = api.getMediaList(seed = seed, offset = offset, limit = params.loadSize)
            LoadResult.Page(
                data = response.items.map { item ->
                    item.copy(
                        thumbnailUrl = item.thumbnailUrl.toAbsoluteUrl() ?: "",
                        resourceUrl = item.resourceUrl.toAbsoluteUrl() ?: "",
                        liked = item.liked == true,
                        favorited = item.favorited == true
                    )
                },
                prevKey = if (offset == 0) null else offset - params.loadSize,
                nextKey = if (response.hasMore) offset + params.loadSize else null
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, MediaItem>): Int? {
        val anchor = state.anchorPosition ?: return null
        val anchorPage = state.closestPageToPosition(anchor) ?: return null
        val prev = anchorPage.prevKey
        val next = anchorPage.nextKey
        val key = when {
            prev != null -> prev + state.config.pageSize
            next != null -> next - state.config.pageSize
            else -> 0
        }
        return if (key < 0) 0 else key
    }
}
