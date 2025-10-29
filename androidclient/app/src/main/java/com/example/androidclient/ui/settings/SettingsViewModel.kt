package com.example.androidclient.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.androidclient.data.model.settings.AutoScanStatusResponse
import com.example.androidclient.data.repository.AutoScanConflictException
import com.example.androidclient.data.repository.SettingsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val repository: SettingsRepository
) : ViewModel() {

    private val _autoScanState: MutableStateFlow<AutoScanUiState> = MutableStateFlow(AutoScanUiState.Loading)
    val autoScanState: StateFlow<AutoScanUiState> = _autoScanState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _autoScanState.value = AutoScanUiState.Loading
            val result = runCatching { repository.fetchAutoScanStatus() }
            result.onSuccess { status ->
                _autoScanState.value = AutoScanUiState.Ready(status = status)
            }
            result.onFailure { throwable ->
                val message = throwable.message ?: "获取自动扫描状态失败，请稍后重试。"
                _autoScanState.value = AutoScanUiState.Error(message)
            }
        }
    }

    fun setAutoScanEnabled(enabled: Boolean) {
        val current = (_autoScanState.value as? AutoScanUiState.Ready) ?: return
        if (current.isUpdating || current.status.enabled == enabled) {
            return
        }

        val optimistic = current.status.copy(
            enabled = enabled,
            active = if (enabled) current.status.active else false
        )
        _autoScanState.value = current.copy(
            status = optimistic,
            isUpdating = true,
            errorMessage = null
        )

        viewModelScope.launch {
            val result = runCatching { repository.updateAutoScan(enabled) }
            result.onSuccess { status ->
                _autoScanState.value = AutoScanUiState.Ready(status = status)
            }
            result.onFailure { throwable ->
                val message = when (throwable) {
                    is AutoScanConflictException -> throwable.message ?: "自动扫描暂不可用。"
                    else -> throwable.message ?: "更新自动扫描设置失败，请稍后重试。"
                }
                _autoScanState.value = AutoScanUiState.Ready(
                    status = current.status,
                    isUpdating = false,
                    errorMessage = message
                )
            }
        }
    }
}

sealed interface AutoScanUiState {
    data object Loading : AutoScanUiState
    data class Ready(
        val status: AutoScanStatusResponse,
        val isUpdating: Boolean = false,
        val errorMessage: String? = null
    ) : AutoScanUiState

    data class Error(val message: String) : AutoScanUiState
}

class SettingsViewModelFactory(
    private val repository: SettingsRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(SettingsViewModel::class.java)) {
            return SettingsViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
