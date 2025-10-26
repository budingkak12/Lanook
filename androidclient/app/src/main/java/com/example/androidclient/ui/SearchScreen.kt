package com.example.androidclient.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.paging.compose.collectAsLazyPagingItems
import com.example.androidclient.data.model.BulkDeleteResult
import com.example.androidclient.data.model.TagOption
import com.example.androidclient.ui.components.MediaGrid
import com.example.androidclient.ui.components.SelectionTopBar

@Composable
fun SearchScreen(
    navController: NavController,
    searchViewModel: SearchViewModel
) {
    var input by remember { mutableStateOf("") }
    val selectedTag by searchViewModel.selectedTag.collectAsState()
    val allTags by searchViewModel.allTags.collectAsState()
    val pagingItems = searchViewModel.thumbnails.collectAsLazyPagingItems()

    val snackbarHostState = remember { SnackbarHostState() }
    var isSelecting by remember { mutableStateOf(false) }
    val selectedMap = remember { mutableStateMapOf<Int, Unit>() }
    val selectedIds: Set<Int> = selectedMap.keys
    var showDeleteDialog by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<BulkDeleteResult?>(null) }
    var isDeleting by remember { mutableStateOf(false) }

    LaunchedEffect(selectedTag) {
        selectedMap.clear()
        isSelecting = false
        showDeleteDialog = false
        pendingDelete = null
        isDeleting = false
    }

    LaunchedEffect(isSelecting, selectedIds.size) {
        if (isSelecting && selectedIds.isEmpty()) {
            isSelecting = false
        }
    }

    LaunchedEffect(pendingDelete) {
        val result = pendingDelete ?: return@LaunchedEffect
        if (result.successIds.isNotEmpty()) {
            result.successIds.forEach { selectedMap.remove(it) }
            pagingItems.refresh()
        }
        when {
            result.isSuccessful -> snackbarHostState.showSnackbar("已删除 ${result.successCount} 项")
            result.successCount == 0 -> snackbarHostState.showSnackbar("删除失败，${result.failureCount} 项未删除")
            else -> snackbarHostState.showSnackbar("部分删除成功：成功 ${result.successCount} 项，失败 ${result.failureCount} 项")
        }
        pendingDelete = null
        isDeleting = false
    }

    val suggestionList = remember(input, allTags) {
        val kw = input.trim().lowercase()
        if (kw.isEmpty()) emptyList() else allTags.filter { it.displayText().lowercase().contains(kw) }.take(12)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                singleLine = true,
                placeholder = { Text("输入标签，如 like / favorite") }
            )

            Button(
                onClick = {
                    val resolved = resolveInputToName(input, allTags) ?: input
                    searchViewModel.setTag(resolved)
                },
                modifier = Modifier
                    .padding(horizontal = 12.dp)
                    .fillMaxWidth()
            ) {
                Text("搜索")
            }

            if (suggestionList.isNotEmpty()) {
                SuggestionList(
                    suggestions = suggestionList,
                    onPick = { opt ->
                        input = opt.displayText()
                        searchViewModel.setTag(opt.name)
                    }
                )
            }

            if (selectedTag == null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) { Text("请输入标签进行搜索") }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    if (isSelecting) {
                        SelectionTopBar(
                            selectedCount = selectedIds.size,
                            onCancel = {
                                selectedMap.clear()
                                isSelecting = false
                            },
                            onDelete = { if (selectedIds.isNotEmpty()) showDeleteDialog = true }
                        )
                    }
                    MediaGrid(
                        items = pagingItems,
                        onThumbnailClick = { index ->
                            if (!isSelecting) {
                                navController.navigate("search-details/$index")
                            }
                        },
                        gridContentDescription = "Search Thumbnail Grid",
                        emptyContent = {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) { Text("暂无结果") }
                        },
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
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp)
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { if (!isDeleting) showDeleteDialog = false },
            title = { Text("删除确认") },
            text = { Text("确定删除选中的 ${selectedIds.size} 项吗？") },
            confirmButton = {
                TextButton(
                    enabled = !isDeleting,
                    onClick = {
                        val snapshot = selectedIds.toSet()
                        if (snapshot.isEmpty()) {
                            showDeleteDialog = false
                            return@TextButton
                        }
                        isDeleting = true
                        showDeleteDialog = false
                        searchViewModel.deleteMedia(snapshot) { result ->
                            pendingDelete = result
                        }
                    }
                ) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { if (!isDeleting) showDeleteDialog = false }) {
                    Text("取消")
                }
            }
        )
    }
}

private fun resolveInputToName(input: String, options: List<TagOption>): String? {
    val trimmed = input.trim()
    if (trimmed.isEmpty()) return null
    options.firstOrNull {
        val dt = it.displayText()
        trimmed.equals(it.name, ignoreCase = true) ||
            (it.displayName?.let { dn -> trimmed.equals(dn, ignoreCase = true) } ?: false) ||
            trimmed.equals(dt, ignoreCase = true)
    }?.let { return it.name }
    return null
}

@Composable
private fun SuggestionList(suggestions: List<TagOption>, onPick: (TagOption) -> Unit) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
    ) {
        items(suggestions) { opt ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onPick(opt) }
                    .padding(vertical = 8.dp)
            ) {
                Text(text = opt.displayText(), style = MaterialTheme.typography.bodyLarge)
            }
            HorizontalDivider()
        }
        item { Spacer(modifier = Modifier.height(4.dp)) }
    }
}
