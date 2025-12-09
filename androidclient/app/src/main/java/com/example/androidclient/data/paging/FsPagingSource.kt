package com.example.androidclient.data.paging

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.example.androidclient.data.model.fs.FsItem
import com.example.androidclient.data.repository.FsRepository

class FsPagingSource(
    private val repo: FsRepository,
    private val rootId: String,
    private val path: String,
    private val showHidden: Boolean = false,
    private val sort: String = "name",
    private val order: String = "asc",
) : PagingSource<Int, FsItem>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, FsItem> {
        val offset = params.key ?: 0
        val limit = params.loadSize
        return try {
            val resp = repo.list(rootId, path, offset, limit, showHidden, sort, order)
            val nextKey = if (offset + limit >= resp.total) null else offset + limit
            val prevKey = if (offset == 0) null else (offset - limit).coerceAtLeast(0)
            LoadResult.Page(
                data = resp.items.filter { !it.isDir },
                prevKey = prevKey,
                nextKey = nextKey
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, FsItem>): Int? {
        return state.anchorPosition?.let { anchor ->
            val page = state.closestPageToPosition(anchor)
            page?.prevKey?.plus(state.config.pageSize)
                ?: page?.nextKey?.minus(state.config.pageSize)
        }
    }
}
