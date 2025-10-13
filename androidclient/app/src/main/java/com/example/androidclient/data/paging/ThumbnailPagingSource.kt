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
    val base = NetworkModule.BASE_URL
    return if (startsWith("/")) base + this else "$base/$this"
}

class ThumbnailPagingSource(
    private val api: ApiService,
    private val sessionRepository: SessionRepository
) : PagingSource<Int, MediaItem>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, MediaItem> {
        val offset = params.key ?: 0
        return try {
            val seed = sessionRepository.seed()
            val response = api.getThumbnailList(seed = seed, offset = offset, limit = params.loadSize)
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
        return state.anchorPosition?.let { anchor ->
            val anchorPage = state.closestPageToPosition(anchor)
            anchorPage?.prevKey?.plus(state.config.pageSize)
                ?: anchorPage?.nextKey?.minus(state.config.pageSize)
        }
    }
}
