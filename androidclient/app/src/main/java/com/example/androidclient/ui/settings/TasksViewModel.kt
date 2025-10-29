package com.example.androidclient.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.androidclient.data.model.tasks.ScanTaskStatusResponse
import com.example.androidclient.data.repository.TasksRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TasksViewModel(
    private val repository: TasksRepository
) : ViewModel() {

    private val _uiState: MutableStateFlow<TaskUiState> = MutableStateFlow(TaskUiState.Loading)
    val uiState: StateFlow<TaskUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh(force: Boolean = false) {
        viewModelScope.launch {
            _uiState.value = TaskUiState.Loading
            val result = runCatching { repository.fetchScanStatus(force) }
            result.onSuccess { response ->
                _uiState.value = TaskUiState.Success(response)
            }
            result.onFailure { throwable ->
                _uiState.value = TaskUiState.Error(
                    throwable.message ?: "获取任务进度失败，请稍后重试。"
                )
            }
        }
    }
}

sealed interface TaskUiState {
    data object Loading : TaskUiState
    data class Success(val data: ScanTaskStatusResponse) : TaskUiState
    data class Error(val message: String) : TaskUiState
}

class TasksViewModelFactory(
    private val repository: TasksRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TasksViewModel::class.java)) {
            return TasksViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
