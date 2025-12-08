package com.example.androidclient.ui.files

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import coil3.compose.AsyncImage
import coil3.size.Size
import com.example.androidclient.data.model.fs.FsItem
import com.example.androidclient.data.repository.FsRepository
import com.example.androidclient.di.NetworkModule

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun FileBrowserScreen(vm: FileBrowserViewModel) {
    val state by vm.uiState.collectAsState()
    val context = LocalContext.current

    var showNewFolder by remember { mutableStateOf(false) }
    var showRename: FsItem? by remember { mutableStateOf(null) }
    var pendingDelete: FsItem? by remember { mutableStateOf(null) }

    LaunchedEffect(Unit) { vm.loadRoots() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("本机文件", fontWeight = FontWeight.Bold)
                        val pathDisplay = state.path.ifBlank { "/" }
                        Text(pathDisplay, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { vm.goParent() }, enabled = state.path.isNotBlank()) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "返回上级")
                    }
                },
                actions = {
                    IconButton(onClick = { vm.toggleHidden() }) {
                        Icon(if (state.showHidden) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = "隐藏项")
                    }
                    IconButton(onClick = { vm.toggleViewMode() }) {
                        Icon(if (state.viewMode == FsViewMode.List) Icons.Filled.GridView else Icons.Filled.List, contentDescription = "视图")
                    }
                    IconButton(onClick = { vm.refresh() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "刷新")
                    }
                }
            )
        },
        bottomBar = {
            BottomAppBar(actions = {
                AssistChip(onClick = { vm.refresh() }, label = { Text("刷新") }, leadingIcon = {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                })
                Spacer(modifier = Modifier.size(8.dp))
                AssistChip(onClick = { showNewFolder = true }, label = { Text("新建文件夹") }, leadingIcon = {
                    Icon(Icons.Outlined.CreateNewFolder, contentDescription = null)
                })
            })
        }
    ) { paddingValues ->
        Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            RootSelector(state, onSelect = { vm.switchRoot(it) })
            if (state.isLoading) {
                LoadingBox()
            } else if (state.error != null) {
                ErrorBox(state.error!!) { vm.refresh() }
            } else {
                if (state.viewMode == FsViewMode.List) {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(state.items.size) { idx ->
                            val item = state.items[idx]
                            FileRow(
                                item = item,
                                thumbUrl = vm.thumbUrl(item, NetworkModule.currentBaseUrl()),
                                onClick = {
                                    if (item.isDir) {
                                        vm.enterDirectory(item.name)
                                    } else {
                                        vm.fileUrl(item, NetworkModule.currentBaseUrl())?.let { url ->
                                            runCatching {
                                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                                context.startActivity(intent)
                                            }
                                        }
                                    }
                                },
                                onLongPress = { pendingDelete = item },
                                onRename = { showRename = item }
                            )
                        }
                    }
                } else {
                    LazyVerticalGrid(columns = GridCells.Adaptive(120.dp), modifier = Modifier.fillMaxSize()) {
                        items(state.items) { item ->
                            FileCard(
                                item = item,
                                thumbUrl = vm.thumbUrl(item, NetworkModule.currentBaseUrl()),
                                onClick = {
                                    if (item.isDir) {
                                        vm.enterDirectory(item.name)
                                    } else {
                                        vm.fileUrl(item, NetworkModule.currentBaseUrl())?.let { url ->
                                            runCatching {
                                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                                context.startActivity(intent)
                                            }
                                        }
                                    }
                                },
                                onLongPress = { pendingDelete = item },
                                onRename = { showRename = item }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showNewFolder) {
        TextInputDialog(
            title = "新建文件夹",
            hint = "名称",
            onDismiss = { showNewFolder = false },
            onConfirm = { name ->
                showNewFolder = false
                vm.mkdir(name) {}
            }
        )
    }

    showRename?.let { target ->
        TextInputDialog(
            title = "重命名",
            hint = "新名称",
            defaultValue = target.name,
            onDismiss = { showRename = null },
            onConfirm = { newName ->
                showRename = null
                vm.rename(target.name, newName) {}
            }
        )
    }

    pendingDelete?.let { target ->
        ConfirmDialog(
            title = "删除确认",
            message = "确定删除 ${target.name} ?",
            onDismiss = { pendingDelete = null },
            onConfirm = {
                pendingDelete = null
                vm.delete(target.name) {}
            }
        )
    }
}

@Composable
private fun RootSelector(state: FileUiState, onSelect: (String) -> Unit) {
    val current = state.currentRoot?.displayName ?: "选择根目录"
    LazyColumn(modifier = Modifier.fillMaxWidth().height(72.dp).padding(horizontal = 12.dp)) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.FolderOpen, contentDescription = null)
                Text(current, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                state.roots.forEach { root ->
                    AssistChip(
                        onClick = { onSelect(root.id) },
                        label = { Text(root.displayName) },
                        leadingIcon = {
                            Icon(Icons.Filled.Folder, contentDescription = null)
                        },
                        modifier = Modifier.padding(end = 6.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadingBox() {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(8.dp))
        Text("加载中…")
    }
}

@Composable
private fun ErrorBox(msg: String, onRetry: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(msg, color = MaterialTheme.colorScheme.error)
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = onRetry) { Text("重试") }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FileRow(
    item: FsItem,
    thumbUrl: String?,
    onClick: () -> Unit,
    onLongPress: () -> Unit,
    onRename: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongPress)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (!item.isDir && thumbUrl != null) {
            AsyncImage(
                model = thumbUrl,
                contentDescription = item.name,
                modifier = Modifier.size(48.dp).background(Color(0x11000000)),
            )
        } else {
            Icon(
                imageVector = if (item.isDir) Icons.Filled.Folder else Icons.Filled.InsertDriveFile,
                contentDescription = null,
                modifier = Modifier.size(32.dp)
            )
        }
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(item.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = if (item.isDir) "文件夹" else humanSize(item.size),
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
        }
        IconButton(onClick = onRename) {
            Icon(Icons.Filled.Edit, contentDescription = "重命名", tint = Color.Gray)
        }
        IconButton(onClick = onLongPress) {
            Icon(Icons.Filled.Delete, contentDescription = "删除", tint = Color.Gray)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FileCard(
    item: FsItem,
    thumbUrl: String?,
    onClick: () -> Unit,
    onLongPress: () -> Unit,
    onRename: () -> Unit,
) {
    Card(
        modifier = Modifier
            .padding(8.dp)
            .combinedClickable(onClick = onClick, onLongClick = onLongPress),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            if (thumbUrl != null) {
                AsyncImage(
                    model = thumbUrl,
                    contentDescription = item.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp)
                        .background(Color(0x11000000))
                )
            } else {
                Icon(
                    imageVector = if (item.isDir) Icons.Filled.Folder else Icons.Filled.InsertDriveFile,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp).padding(8.dp)
                )
            }
            Text(item.name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
            Text(if (item.isDir) "文件夹" else humanSize(item.size), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onRename) { Text("重命名") }
            }
        }
    }
}

@Composable
private fun TextInputDialog(
    title: String,
    hint: String,
    defaultValue: String = "",
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var text by remember { mutableStateOf(defaultValue) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(value = text, onValueChange = { text = it }, label = { Text(hint) }) },
        confirmButton = {
            TextButton(onClick = { onConfirm(text) }) { Text("确定") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

@Composable
private fun ConfirmDialog(title: String, message: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("删除") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

private fun humanSize(size: Long): String {
    if (size <= 0) return "0B"
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var v = size.toDouble()
    var i = 0
    while (v >= 1024 && i < units.lastIndex) {
        v /= 1024
        i++
    }
    return String.format("%.1f%s", v, units[i])
}
