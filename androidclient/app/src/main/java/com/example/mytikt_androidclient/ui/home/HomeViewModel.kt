package com.example.mytikt_androidclient.ui.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.mytikt_androidclient.data.model.MediaItem
import com.example.mytikt_androidclient.data.repository.FeedRepository
import com.example.mytikt_androidclient.di.ServiceLocator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.abs

private const val LOAD_MORE_THRESHOLD = 3

class HomeViewModel(private val repository: FeedRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val resp = repository.loadInitialPage()
                val positions = buildPlaybackPositions(emptyMap(), resp.items)
                _uiState.value = HomeUiState(
                    isLoading = false,
                    items = resp.items,
                    currentIndex = 0,
                    nextOffset = resp.nextOffset,
                    hasMore = resp.hasMore,
                    playbackPositions = positions
                )
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = e.message ?: "加载失败") }
            }
        }
    }

    fun onPageChanged(index: Int) {
        _uiState.update {
            if (it.currentIndex == index) it else it.copy(currentIndex = index)
        }
        maybeLoadMore(index)
    }

    fun toggleTag(tag: MediaTag) {
        val state = _uiState.value
        val current = state.items.getOrNull(state.currentIndex) ?: return
        val desired = when (tag) {
            MediaTag.LIKE -> current.liked != true
            MediaTag.FAVORITE -> current.favorited != true
        }
        viewModelScope.launch {
            try {
                repository.setTag(current.id, tag.apiName, desired)
                _uiState.update { ui ->
                    ui.copy(
                        items = ui.items.updateAt(ui.currentIndex) { item ->
                            when (tag) {
                                MediaTag.LIKE -> item.copy(liked = desired)
                                MediaTag.FAVORITE -> item.copy(favorited = desired)
                            }
                        }
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = e.message ?: "操作失败") }
            }
        }
    }

    fun deleteCurrent(deleteFile: Boolean = true) {
        val state = _uiState.value
        if (state.isDeleting) return
        val current = state.items.getOrNull(state.currentIndex) ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true, errorMessage = null) }
            try {
                repository.deleteMedia(current.id, deleteFile)
                _uiState.update { ui ->
                    val newList = ui.items.toMutableList().apply {
                        if (ui.currentIndex in indices) removeAt(ui.currentIndex)
                    }
                    val newIndex = when {
                        newList.isEmpty() -> 0
                        ui.currentIndex >= newList.size -> newList.lastIndex
                        else -> ui.currentIndex
                    }
                    val newPositions = ui.playbackPositions - current.id
                    ui.copy(
                        items = newList,
                        currentIndex = newIndex,
                        isDeleting = false,
                        playbackPositions = newPositions
                    )
                }
                maybeLoadMore(_uiState.value.currentIndex)
            } catch (e: Exception) {
                _uiState.update { it.copy(isDeleting = false, errorMessage = e.message ?: "删除失败") }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun maybeLoadMore(targetIndex: Int) {
        val state = _uiState.value
        if (state.isLoading || state.isPaging || !state.hasMore) return
        if (state.items.size - targetIndex > LOAD_MORE_THRESHOLD) return
        viewModelScope.launch {
            _uiState.update { it.copy(isPaging = true) }
            try {
                val resp = repository.loadMore(state.nextOffset)
                _uiState.update { ui ->
                    val mergedPositions = buildPlaybackPositions(ui.playbackPositions, resp.items)
                    ui.copy(
                        items = ui.items + resp.items,
                        nextOffset = resp.nextOffset,
                        hasMore = resp.hasMore,
                        isPaging = false,
                        playbackPositions = mergedPositions
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isPaging = false, errorMessage = e.message ?: "加载更多失败") }
            }
        }
    }

    fun onPlaybackProgress(mediaId: Long, positionMs: Long) {
        _uiState.update { state ->
            val current = state.playbackPositions[mediaId]
            if (current != null && abs(current - positionMs) < 250) {
                state
            } else {
                state.copy(playbackPositions = state.playbackPositions + (mediaId to positionMs))
            }
        }
    }

    fun onPlaybackEnded(mediaId: Long) {
        _uiState.update { state ->
            if (state.playbackPositions[mediaId] == 0L) state else state.copy(
                playbackPositions = state.playbackPositions + (mediaId to 0L)
            )
        }
    }

    enum class MediaTag(val apiName: String) {
        LIKE("like"),
        FAVORITE("favorite")
    }

    data class HomeUiState(
        val isLoading: Boolean = true,
        val isPaging: Boolean = false,
        val items: List<MediaItem> = emptyList(),
        val currentIndex: Int = 0,
        val nextOffset: Int = 0,
        val hasMore: Boolean = true,
        val isDeleting: Boolean = false,
        val errorMessage: String? = null,
        val playbackPositions: Map<Long, Long> = emptyMap()
    )

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val repo = ServiceLocator.provideFeedRepository(context)
                return HomeViewModel(repo) as T
            }
        }
    }
}

private fun <T> List<T>.updateAt(index: Int, block: (T) -> T): List<T> {
    if (index !in indices) return this
    val mutable = toMutableList()
    mutable[index] = block(mutable[index])
    return mutable.toList()
}

private fun buildPlaybackPositions(
    existing: Map<Long, Long>,
    items: List<MediaItem>
): Map<Long, Long> {
    if (items.isEmpty()) return existing
    val updated = existing.toMutableMap()
    for (item in items) {
        if (updated[item.id] == null) {
            updated[item.id] = 0L
        }
    }
    return updated.toMap()
}
