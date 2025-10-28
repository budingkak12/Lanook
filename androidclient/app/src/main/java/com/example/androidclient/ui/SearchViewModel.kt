package com.example.androidclient.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.data.paging.SearchPagingSource
import com.example.androidclient.data.remote.ApiService
import com.example.androidclient.data.model.TagOption
import com.example.androidclient.data.model.BulkDeleteResult
import com.example.androidclient.data.repository.MediaRepository
import kotlinx.coroutines.flow.Flow
import androidx.paging.cachedIn
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SearchViewModel(
    private val api: ApiService,
    private val translate: Map<String, String> = emptyMap()
) : ViewModel() {

    private val mediaRepository = MediaRepository(api)

    private val _selectedTag = MutableStateFlow<String?>(null)
    val selectedTag = _selectedTag.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun setTag(tag: String?) {
        val t = tag?.trim()?.takeIf { it.isNotEmpty() }
        _selectedTag.value = t
    }

    // 全量标签（含 displayName），供本地联想过滤
    private val _allTags = MutableStateFlow<List<TagOption>>(emptyList())
    val allTags = _allTags.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        // 首次进入拉取全部标签并构造显示名
        viewModelScope.launch {
            runCatching { api.getAllTags() }
                .onSuccess { resp ->
                    val mapped = resp.tags.map { name ->
                        TagOption(name = name, displayName = translate[name])
                    }
                    _allTags.value = mapped
                }
                .onFailure {
                    // 保持空表，UI 将不会显示建议
                }
        }
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

    fun deleteMedia(
        mediaIds: Set<Int>,
        deleteFile: Boolean = true,
        onResult: (BulkDeleteResult) -> Unit
    ) {
        viewModelScope.launch {
            val result = mediaRepository.deleteMedia(mediaIds, deleteFile)
            onResult(result)
        }
    }
}

class SearchViewModelFactory(
    private val api: ApiService,
    private val translate: Map<String, String>
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(SearchViewModel::class.java)) {
            return SearchViewModel(api, translate) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
