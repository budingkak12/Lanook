package com.example.androidclient.ui.files

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.androidclient.data.model.fs.FsItem
import com.example.androidclient.data.model.fs.FsRoot
import com.example.androidclient.data.repository.FsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

enum class FsViewMode { List, Grid }

data class FileUiState(
    val roots: List<FsRoot> = emptyList(),
    val currentRoot: FsRoot? = null,
    val path: String = "",
    val items: List<FsItem> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val showHidden: Boolean = false,
    val viewMode: FsViewMode = FsViewMode.List
)

class FileBrowserViewModel(private val repo: FsRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(FileUiState())
    val uiState: StateFlow<FileUiState> = _uiState.asStateFlow()

    fun loadRoots() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = runCatching { repo.roots() }
            result.onSuccess { roots ->
                val available = roots.firstOrNull { it.available } ?: roots.firstOrNull()
                _uiState.update {
                    it.copy(roots = roots, currentRoot = available, isLoading = false, path = "")
                }
                available?.let { refresh() }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "加载根目录失败") }
            }
        }
    }

    fun refresh() {
        val root = _uiState.value.currentRoot ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = runCatching {
                repo.list(
                    rootId = root.id,
                    path = _uiState.value.path,
                    offset = 0,
                    limit = 300,
                    showHidden = _uiState.value.showHidden
                )
            }
            result.onSuccess { resp ->
                _uiState.update { it.copy(items = resp.items, isLoading = false) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "加载失败") }
            }
        }
    }

    fun enterDirectory(name: String) {
        val newPath = if (_uiState.value.path.isBlank()) name else _uiState.value.path.trimEnd('/') + "/" + name
        _uiState.update { it.copy(path = newPath) }
        refresh()
    }

    fun goParent() {
        val path = _uiState.value.path
        if (path.isBlank()) return
        val trimmed = path.trimEnd('/')
        val parent = trimmed.substringBeforeLast('/', "")
        _uiState.update { it.copy(path = parent) }
        refresh()
    }

    fun switchRoot(id: String) {
        val root = _uiState.value.roots.firstOrNull { it.id == id } ?: return
        _uiState.update { it.copy(currentRoot = root, path = "", items = emptyList()) }
        refresh()
    }

    fun toggleHidden() {
        _uiState.update { it.copy(showHidden = !it.showHidden) }
        refresh()
    }

    fun toggleViewMode() {
        _uiState.update {
            it.copy(viewMode = if (it.viewMode == FsViewMode.List) FsViewMode.Grid else FsViewMode.List)
        }
    }

    fun mkdir(dirName: String, onDone: (Result<Unit>) -> Unit = {}) {
        val root = _uiState.value.currentRoot ?: return
        val path = if (_uiState.value.path.isBlank()) dirName else _uiState.value.path.trimEnd('/') + "/" + dirName
        viewModelScope.launch {
            val result = runCatching { repo.mkdir(root.id, path) }
            result.onSuccess { refresh() }
            onDone(result.map { })
        }
    }

    fun delete(path: String, onDone: (Result<Unit>) -> Unit = {}) {
        val root = _uiState.value.currentRoot ?: return
        viewModelScope.launch {
            val result = runCatching { repo.delete(root.id, listOf(path)) }
            result.onSuccess { refresh() }
            onDone(result.map { })
        }
    }

    fun rename(oldName: String, newName: String, onDone: (Result<Unit>) -> Unit = {}) {
        val root = _uiState.value.currentRoot ?: return
        val base = _uiState.value.path.trimEnd('/')
        val src = if (base.isBlank()) oldName else "$base/$oldName"
        val dst = if (base.isBlank()) newName else "$base/$newName"
        viewModelScope.launch {
            val result = runCatching { repo.rename(root.id, src, dst) }
            result.onSuccess { refresh() }
            onDone(result.map { })
        }
    }

    fun fileUrl(item: FsItem, baseUrl: String?): String? {
        val root = _uiState.value.currentRoot ?: return null
        val path = if (_uiState.value.path.isBlank()) item.name else _uiState.value.path.trimEnd('/') + "/" + item.name
        val encoded = path.split('/')
            .joinToString("/") { URLEncoder.encode(it, StandardCharsets.UTF_8.toString()) }
        val base = baseUrl ?: return null
        return "$base/fs/file?root_id=${root.id}&path=$encoded"
    }

    fun thumbUrl(item: FsItem, baseUrl: String?): String? {
        val root = _uiState.value.currentRoot ?: return null
        val base = baseUrl ?: return null

        // 优先使用后端返回的 thumbnail_url（可能是相对路径）
        item.thumbnailUrl?.let { url ->
            return resolveUrl(url, base)
        }

        // 按需生成缩略图（图片/视频才有意义）
        val p = if (_uiState.value.path.isBlank()) item.name else _uiState.value.path.trimEnd('/') + "/" + item.name
        val encoded = p.split('/')
            .joinToString("/") { URLEncoder.encode(it, StandardCharsets.UTF_8.toString()) }
        return "$base/fs/thumb?root_id=${root.id}&path=$encoded"
    }

    private fun resolveUrl(path: String, baseUrl: String): String {
        return when {
            path.startsWith("http://") || path.startsWith("https://") -> path
            path.startsWith("/") -> baseUrl + path
            else -> if (baseUrl.endsWith('/')) baseUrl + path else "$baseUrl/$path"
        }
    }
}
