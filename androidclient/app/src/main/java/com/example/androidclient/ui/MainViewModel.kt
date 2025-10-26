package com.example.androidclient.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.data.paging.ThumbnailRepository
import com.example.androidclient.data.model.BulkDeleteResult
import com.example.androidclient.data.repository.MediaRepository
import com.example.androidclient.data.repository.SessionRepository
import com.example.androidclient.data.repository.TagRepository
import com.example.androidclient.di.NetworkModule
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class MainViewModel : ViewModel() {

    private val sessionRepository = SessionRepository(NetworkModule.api)
    private val thumbnailRepository = ThumbnailRepository(NetworkModule.api, sessionRepository)
    private val mediaRepository = MediaRepository(NetworkModule.api)
    private val tagRepository = TagRepository(NetworkModule.api)

    private val _tagOverrides = MutableStateFlow<Map<Int, TagState>>(emptyMap())
    val tagOverrides: StateFlow<Map<Int, TagState>> = _tagOverrides.asStateFlow()

    val thumbnails: Flow<PagingData<MediaItem>> =
        thumbnailRepository.thumbnailPager().cachedIn(viewModelScope)

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

    fun setLike(mediaId: Int, target: Boolean, onResult: (Result<Unit>) -> Unit = {}) {
        viewModelScope.launch {
            val result = runCatching { tagRepository.setLike(mediaId, target) }
            result.onSuccess {
                applyOverride(mediaId) { current -> current.copy(liked = target) }
            }
            onResult(result)
        }
    }

    fun setFavorite(mediaId: Int, target: Boolean, onResult: (Result<Unit>) -> Unit = {}) {
        viewModelScope.launch {
            val result = runCatching { tagRepository.setFavorite(mediaId, target) }
            result.onSuccess {
                applyOverride(mediaId) { current -> current.copy(favorited = target) }
            }
            onResult(result)
        }
    }

    fun clearOverride(mediaId: Int) {
        _tagOverrides.update { map ->
            if (map.containsKey(mediaId)) {
                map.toMutableMap().also { it.remove(mediaId) }
            } else {
                map
            }
        }
    }

    fun overrideFor(mediaId: Int): TagState? = _tagOverrides.value[mediaId]

    private fun applyOverride(mediaId: Int, transform: (TagState) -> TagState) {
        _tagOverrides.update { map ->
            val mutable = map.toMutableMap()
            val updated = transform(mutable[mediaId] ?: TagState())
            mutable[mediaId] = updated
            mutable
        }
    }

    data class TagState(
        val liked: Boolean? = null,
        val favorited: Boolean? = null
    )
}
