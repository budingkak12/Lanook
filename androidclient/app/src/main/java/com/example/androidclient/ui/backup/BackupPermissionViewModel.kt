package com.example.androidclient.ui.backup

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.androidclient.data.backup.AddFolderResult
import com.example.androidclient.data.backup.BackupDatabaseProvider
import com.example.androidclient.data.backup.BackupFolder
import com.example.androidclient.data.backup.BackupRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class BackupPermissionUiState(
    val hasPermission: Boolean = false,
    val grantedRoots: List<String> = emptyList(),
    val isRefreshing: Boolean = false,
    val folders: List<BackupFolderUi> = emptyList(),
    val scanningIds: Set<Long> = emptySet()
)

sealed interface BackupPermissionEvent {
    data class Message(val text: String) : BackupPermissionEvent
}

data class BackupFolderUi(
    val id: Long,
    val name: String,
    val uri: String,
    val enabled: Boolean,
    val pending: Int,
    val lastScanAt: Long?
)

class BackupPermissionViewModel(
    application: Application
) : AndroidViewModel(application) {

    private val repository = BackupRepository(BackupDatabaseProvider.get(application), application)

    private val _uiState = MutableStateFlow(BackupPermissionUiState(isRefreshing = true))
    val uiState = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<BackupPermissionEvent>()
    val events = _events.asSharedFlow()

    init {
        refreshPermissions()
        observeFolders()
    }

    fun refreshPermissions() {
        _uiState.update { it.copy(isRefreshing = true) }
        val resolver = getApplication<Application>().contentResolver
        val persisted = resolver.persistedUriPermissions
            .filter { it.isReadPermission }
            .map { permission ->
                permission.uri.lastPathSegment ?: permission.uri.toString()
            }
        _uiState.value = _uiState.value.copy(
            hasPermission = persisted.isNotEmpty(),
            grantedRoots = persisted,
            isRefreshing = false
        )
    }

    private fun observeFolders() {
        viewModelScope.launch {
            repository.folders().collectLatest { folders ->
                _uiState.update { current ->
                    current.copy(
                        folders = folders.map {
                            BackupFolderUi(
                                id = it.id,
                                name = it.displayName,
                                uri = it.uri,
                                enabled = it.enabled,
                                pending = it.pendingCount,
                                lastScanAt = it.lastScanAt
                            )
                        }
                    )
                }
            }
        }
    }

    fun toggleFolder(id: Long, enabled: Boolean) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repository.toggleFolder(id, enabled) }
        }
    }

    fun deleteFolder(id: Long) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repository.deleteFolder(id) }
            emitMessage("已删除目录")
        }
    }

    fun refreshPending(folderId: Long) {
        val folder = _uiState.value.folders.find { it.id == folderId } ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(scanningIds = it.scanningIds + folderId) }
            try {
                val pending = withContext(Dispatchers.IO) {
                    repository.scanFolder(
                        BackupFolder(
                            id = folder.id,
                            uri = folder.uri,
                            displayName = folder.name,
                            enabled = folder.enabled,
                            pendingCount = folder.pending,
                            lastScanAt = folder.lastScanAt
                        )
                    )
                }
                emitMessage("扫描完成，待上传：$pending")
            } catch (e: SecurityException) {
                emitMessage("无法访问目录，请重新授权")
            } finally {
                _uiState.update { it.copy(scanningIds = it.scanningIds - folderId) }
            }
        }
    }

    fun onDirectoryPicked(uri: Uri?) {
        if (uri == null) {
            emitMessage("未选择任何目录")
            return
        }
        viewModelScope.launch {
            try {
                val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                val resolver = getApplication<Application>().contentResolver
                resolver.takePersistableUriPermission(uri, flags)
                handleAddFolder(uri)
            } catch (e: SecurityException) {
                emitMessage("保存权限失败，请重试")
            } finally {
                refreshPermissions()
            }
        }
    }

    private suspend fun handleAddFolder(uri: Uri) = withContext(Dispatchers.IO) {
        val context = getApplication<Application>()
        val document = DocumentFile.fromTreeUri(context, uri)
        val name = document?.name ?: uri.lastPathSegment ?: "未命名目录"
        val result = repository.addFolder(
            BackupFolder(
                uri = uri.toString(),
                displayName = name
            )
        )
        when (result) {
            AddFolderResult.Added -> emitMessage("已添加目录：$name")
            AddFolderResult.Duplicate -> emitMessage("目录已在列表中：$name")
            is AddFolderResult.ParentConflict -> emitMessage("冲突：已存在子目录 ${result.name}，请先删除或保留父目录")
            is AddFolderResult.ChildConflict -> emitMessage("冲突：已存在父目录 ${result.name}，无需重复添加子目录")
        }
    }

    fun updateFolder(id: Long, name: String) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repository.updateFolder(id, name) }
        }
    }

    private fun emitMessage(text: String) {
        viewModelScope.launch {
            _events.emit(BackupPermissionEvent.Message(text))
        }
    }
}

class BackupPermissionViewModelFactory(
    private val application: Application
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(BackupPermissionViewModel::class.java)) {
            return BackupPermissionViewModel(application) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
