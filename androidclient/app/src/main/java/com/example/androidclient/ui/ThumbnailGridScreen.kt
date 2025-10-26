package com.example.androidclient.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.paging.compose.collectAsLazyPagingItems
import com.example.androidclient.ui.components.MediaGrid
import com.example.androidclient.ui.components.SelectionTopBar
import com.example.androidclient.data.model.MediaItem
import androidx.paging.compose.LazyPagingItems
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.example.androidclient.data.model.BulkDeleteResult

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThumbnailGridScreen(viewModel: MainViewModel, onThumbnailClick: (Int) -> Unit) {
    val items: LazyPagingItems<MediaItem> = viewModel.thumbnails.collectAsLazyPagingItems()
    val snackbarHostState = remember { SnackbarHostState() }
    var isSelecting by remember { mutableStateOf(false) }
    val selectedMap = remember { mutableStateMapOf<Int, Unit>() }
    val selectedIds: Set<Int> = selectedMap.keys
    var showDeleteDialog by remember { mutableStateOf(false) }
    var isDeleting by remember { mutableStateOf(false) }
    var pendingResult by remember { mutableStateOf<BulkDeleteResult?>(null) }

    fun exitSelection() {
        selectedMap.clear()
        isSelecting = false
    }

    LaunchedEffect(pendingResult) {
        val result = pendingResult ?: return@LaunchedEffect
        if (result.successIds.isNotEmpty()) {
            result.successIds.forEach { selectedMap.remove(it) }
            items.refresh()
        }
        when {
            result.isSuccessful -> {
                if (result.successCount > 0) {
                    snackbarHostState.showSnackbar("已删除 ${result.successCount} 项")
                }
                exitSelection()
            }
            result.successCount == 0 -> {
                snackbarHostState.showSnackbar("删除失败，${result.failureCount} 项未能删除")
            }
            else -> {
                snackbarHostState.showSnackbar("部分删除成功：成功 ${result.successCount} 项，失败 ${result.failureCount} 项")
            }
        }
        pendingResult = null
        isDeleting = false
    }

    Scaffold(
        topBar = {
            if (isSelecting) {
                SelectionTopBar(
                    selectedCount = selectedIds.size,
                    onCancel = { exitSelection() },
                    onDelete = { if (selectedIds.isNotEmpty()) showDeleteDialog = true }
                )
            }
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
    ) { paddingValues ->
        MediaGrid(
            items = items,
            onThumbnailClick = onThumbnailClick,
            modifier = Modifier.padding(paddingValues),
            gridContentDescription = "Thumbnail Grid",
            isSelecting = isSelecting,
            selectedIds = selectedIds,
            onSelectionToggle = { mediaId, shouldSelect ->
                if (shouldSelect) {
                    selectedMap[mediaId] = Unit
                } else {
                    selectedMap.remove(mediaId)
                }
            },
            onRequestSelectionMode = {
                if (!isSelecting) {
                    isSelecting = true
                }
            },
            onSelectionGestureFinish = {}
        )
    }

    if (showDeleteDialog) {
        val count = selectedIds.size
        AlertDialog(
            onDismissRequest = {
                if (!isDeleting) showDeleteDialog = false
            },
            title = { Text("删除确认") },
            text = { Text("确定删除选中的 $count 项吗？此操作不可恢复。") },
            confirmButton = {
                TextButton(
                    enabled = !isDeleting,
                    onClick = {
                        if (selectedIds.isEmpty()) {
                            showDeleteDialog = false
                            return@TextButton
                        }
                        isDeleting = true
                        showDeleteDialog = false
                        viewModel.deleteMedia(selectedIds.toSet()) { result ->
                            pendingResult = result
                        }
                    }
                ) {
                    Text("删除")
                }
            },
            dismissButton = {
                TextButton(onClick = { if (!isDeleting) showDeleteDialog = false }) {
                    Text("取消")
                }
            }
        )
    }
}
