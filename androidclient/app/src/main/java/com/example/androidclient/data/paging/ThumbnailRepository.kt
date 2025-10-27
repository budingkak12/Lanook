package com.example.androidclient.data.paging

import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.data.remote.ApiService
import com.example.androidclient.data.repository.SessionRepository
import kotlinx.coroutines.flow.Flow
class ThumbnailRepository(
    private val api: ApiService,
    private val sessionRepository: SessionRepository
) {

    fun thumbnailPager(): Flow<PagingData<MediaItem>> = Pager(
        config = PagingConfig(
            pageSize = 20,
            initialLoadSize = 20,
            prefetchDistance = 10,
            enablePlaceholders = false,
            maxSize = 200
        ),
        pagingSourceFactory = { ThumbnailPagingSource(api, sessionRepository) }
    ).flow
}
