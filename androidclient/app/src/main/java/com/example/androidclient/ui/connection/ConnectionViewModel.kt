package com.example.androidclient.ui.connection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.androidclient.data.connection.ConnectionRepository
import com.example.androidclient.data.model.setup.InitializationState
import com.example.androidclient.data.setup.SetupRepository
import com.example.androidclient.di.NetworkModule
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConnectionUiState(
    val baseUrlInput: String = "",
    val isChecking: Boolean = false,
    val errorMessage: String? = null,
    val lastSuccessUrl: String? = null,
    val cameraPermissionDenied: Boolean = false
)

sealed interface ConnectionEvent {
    data class Connected(val baseUrl: String, val requiresSetup: Boolean) : ConnectionEvent
}

class ConnectionViewModel(
    private val repository: ConnectionRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConnectionUiState())
    val uiState: StateFlow<ConnectionUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<ConnectionEvent>(extraBufferCapacity = 1)
    val events: SharedFlow<ConnectionEvent> = _events.asSharedFlow()

    private var autoNavigated = false
    private var autoProbeStarted = false
    private val defaultCandidates = listOf("http://172.29.45.74:8000")

    init {
        viewModelScope.launch {
            repository.storedBaseUrl().collect { stored ->
                val canonical = stored?.let { repository.canonicalize(it) }
                if (canonical.isNullOrBlank()) return@collect
                _uiState.update {
                    it.copy(
                        baseUrlInput = canonical,
                        lastSuccessUrl = canonical,
                        errorMessage = null
                    )
                }
                if (!autoNavigated) {
                    autoNavigated = true
                    NetworkModule.updateBaseUrl(canonical)
                    val requireSetup = runCatching { determineRequiresSetup() }.getOrElse { true }
                    _events.emit(ConnectionEvent.Connected(canonical, requireSetup))
                }
            }
        }
        viewModelScope.launch {
            probeDefaultCandidates()
        }
    }

    fun onInputChanged(value: String) {
        _uiState.update { it.copy(baseUrlInput = value, errorMessage = null) }
    }

    fun onScanResult(raw: String) {
        val canonical = repository.canonicalize(raw)
        if (canonical == null) {
            _uiState.update { it.copy(errorMessage = "二维码内容无法识别：$raw") }
        } else {
            _uiState.update { it.copy(baseUrlInput = canonical, errorMessage = null) }
        }
    }

    fun onCameraPermissionDenied() {
        _uiState.update { it.copy(cameraPermissionDenied = true) }
    }

    fun consumeCameraPermissionNotice() {
        _uiState.update { it.copy(cameraPermissionDenied = false) }
    }

    fun connect() {
        val candidate = _uiState.value.baseUrlInput
        if (candidate.isBlank()) {
            _uiState.update { it.copy(errorMessage = "请输入服务器地址") }
            return
        }
        performConnect(candidate)
    }

    private fun performConnect(raw: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isChecking = true, errorMessage = null) }
            val result = repository.verifyAndPersist(raw)
            result.onSuccess { url ->
                val requiresSetup = determineRequiresSetup()
                _uiState.update { it.copy(isChecking = false, lastSuccessUrl = url) }
                _events.emit(ConnectionEvent.Connected(url, requiresSetup))
            }.onFailure { err ->
                _uiState.update { it.copy(isChecking = false, errorMessage = err.message ?: "连接失败") }
            }
        }
    }

    private suspend fun determineRequiresSetup(): Boolean {
        // 确保网络层指向最新服务器
        val repo = SetupRepository(NetworkModule.api)
        val statusResult = runCatching { repo.fetchStatus() }
        val status = statusResult.getOrNull() ?: return true
        return status.state != InitializationState.COMPLETED || status.mediaRootPath.isNullOrBlank()
    }

    /**
     * 优先尝试预设内网地址，成功则直接导航；失败则保持原有手动流程。
     */
    private suspend fun probeDefaultCandidates() {
        if (autoNavigated || autoProbeStarted) return
        autoProbeStarted = true
        val hit = repository.findReachable(defaultCandidates)
        if (hit != null && !autoNavigated) {
            autoNavigated = true
            NetworkModule.updateBaseUrl(hit)
            repository.saveBaseUrl(hit)
            val requiresSetup = runCatching { determineRequiresSetup() }.getOrElse { true }
            _uiState.update { it.copy(baseUrlInput = hit, lastSuccessUrl = hit, errorMessage = null) }
            _events.emit(ConnectionEvent.Connected(hit, requiresSetup))
        }
    }

    class Factory(private val repository: ConnectionRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(ConnectionViewModel::class.java)) {
                return ConnectionViewModel(repository) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
