package com.example.androidclient.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.androidclient.data.model.setup.DirectoryEntry
import com.example.androidclient.data.model.setup.InitializationState
import com.example.androidclient.data.model.setup.InitializationStatusResponse
import com.example.androidclient.data.setup.SetupRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SetupUiState(
    val roots: List<DirectoryEntry> = emptyList(),
    val currentPath: String? = null,
    val parentPath: String? = null,
    val entries: List<DirectoryEntry> = emptyList(),
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val initializationState: InitializationState? = null,
    val statusMessage: String? = null,
    val errorMessage: String? = null
)

sealed interface SetupEvent {
    object Initialized : SetupEvent
}

class SetupViewModel(
    private val repository: SetupRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<SetupEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<SetupEvent> = _events.asSharedFlow()

    private var hasLoaded = false
    private var pollingJob: Job? = null

    fun loadInitial() {
        if (hasLoaded) return
        hasLoaded = true

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val rootsResult = runCatching { repository.fetchRoots() }
            val statusResult = runCatching { repository.fetchStatus() }

            val roots = rootsResult.getOrElse { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "无法获取可选根目录"
                    )
                }
                return@launch
            }

            val status = statusResult.getOrElse { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        roots = roots,
                        errorMessage = error.message ?: "无法获取初始化状态"
                    )
                }
                return@launch
            }

            applyStatus(status)
            _uiState.update {
                it.copy(
                    roots = roots,
                    isLoading = false
                )
            }

            when (status.state) {
                InitializationState.COMPLETED -> {
                    _events.emit(SetupEvent.Initialized)
                }
                InitializationState.RUNNING -> {
                    startPolling()
                }
                else -> {
                    status.mediaRootPath?.let { existingPath ->
                        loadDirectoryInternal(existingPath)
                    }
                }
            }
        }
    }

    fun enterDirectory(path: String) {
        viewModelScope.launch {
            loadDirectoryInternal(path)
        }
    }

    private suspend fun loadDirectoryInternal(path: String) {
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        val result = runCatching { repository.listDirectory(path) }
        result.onSuccess { response ->
            _uiState.update {
                it.copy(
                    currentPath = response.currentPath,
                    parentPath = response.parentPath,
                    entries = response.entries,
                    isLoading = false
                )
            }
        }.onFailure { error ->
            _uiState.update {
                it.copy(
                    isLoading = false,
                    errorMessage = error.message ?: "目录加载失败"
                )
            }
        }
    }

    fun openRoots() {
        pollingJob?.cancel()
        _uiState.update {
            it.copy(
                currentPath = null,
                parentPath = null,
                entries = emptyList(),
                isLoading = false,
                errorMessage = null
            )
        }
    }

    fun goParent() {
        val parent = _uiState.value.parentPath ?: return
        enterDirectory(parent)
    }

    fun confirmSelection() {
        val path = _uiState.value.currentPath ?: return
        if (_uiState.value.isSubmitting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            val result = runCatching { repository.submitMediaRoot(path) }
            result.onSuccess { status ->
                applyStatus(status)
                if (status.state == InitializationState.COMPLETED) {
                    _uiState.update { it.copy(isSubmitting = false) }
                    _events.emit(SetupEvent.Initialized)
                } else if (status.state == InitializationState.RUNNING) {
                    startPolling()
                } else {
                    _uiState.update { it.copy(isSubmitting = false) }
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        errorMessage = error.message ?: "提交失败"
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun applyStatus(status: InitializationStatusResponse) {
        _uiState.update {
            it.copy(
                initializationState = status.state,
                statusMessage = status.message,
                isSubmitting = status.state == InitializationState.RUNNING,
                currentPath = status.mediaRootPath ?: it.currentPath
            )
        }
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (true) {
                delay(1200)
                val statusResult = runCatching { repository.fetchStatus() }
                val status = statusResult.getOrElse { error ->
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            errorMessage = error.message ?: "查询初始化状态失败"
                        )
                    }
                    return@launch
                }
                applyStatus(status)
                when (status.state) {
                    InitializationState.COMPLETED -> {
                        _uiState.update { it.copy(isSubmitting = false) }
                        _events.emit(SetupEvent.Initialized)
                        return@launch
                    }
                    InitializationState.FAILED -> {
                        _uiState.update { it.copy(isSubmitting = false) }
                        return@launch
                    }
                    InitializationState.RUNNING -> continue
                    InitializationState.IDLE -> {
                        _uiState.update { it.copy(isSubmitting = false) }
                        return@launch
                    }
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }

    class Factory(
        private val repository: SetupRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(SetupViewModel::class.java)) {
                return SetupViewModel(repository) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
