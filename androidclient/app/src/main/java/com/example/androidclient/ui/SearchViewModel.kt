package com.example.androidclient.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.data.paging.SearchPagingSource
import com.example.androidclient.data.remote.ApiService
import kotlinx.coroutines.flow.Flow
import androidx.paging.cachedIn
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class SearchViewModel(
    private val api: ApiService
) : ViewModel() {

    private val _selectedTag = MutableStateFlow<String?>(null)
    val selectedTag = _selectedTag.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun setTag(tag: String?) {
        val t = tag?.trim()?.takeIf { it.isNotEmpty() }
        _selectedTag.value = t
    }

    val thumbnails: Flow<PagingData<MediaItem>> = _selectedTag
        .flatMapLatest { tagOrNull ->
            if (tagOrNull == null) {
                // 不触发任何网络请求，直接给空数据
                kotlinx.coroutines.flow.flowOf(androidx.paging.PagingData.empty())
            } else {
                Pager(
                    config = PagingConfig(
                        pageSize = 20,
                        prefetchDistance = 10,
                        enablePlaceholders = false,
                        maxSize = 200
                    ),
                    pagingSourceFactory = { SearchPagingSource(api, tagOrNull) }
                ).flow
            }
        }
        .cachedIn(viewModelScope)
}
