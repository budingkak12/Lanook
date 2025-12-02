package com.example.androidclient.ui.backup

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.example.androidclient.work.BackupWorker

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackupSettingsScreen(
    viewModel: BackupPermissionViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    val directoryPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        viewModel.onDirectoryPicked(uri)
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refreshPermissions()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is BackupPermissionEvent.Message -> snackbarHostState.showSnackbar(event.text)
            }
        }
    }

    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("本机备份") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "返回"
                        )
                    }
                },
                scrollBehavior = scrollBehavior
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            PermissionCard(
                state = uiState,
                onRequestPermission = { directoryPicker.launch(null) },
                onRecheck = viewModel::refreshPermissions
            )

            Button(
                onClick = {
                    val request = OneTimeWorkRequestBuilder<BackupWorker>().build()
                    WorkManager.getInstance(context).enqueue(request)
                    coroutineScope.launch { snackbarHostState.showSnackbar("已触发备份任务") }
                },
                enabled = uiState.hasPermission
            ) {
                Text("立即扫描并上传")
            }

            FolderList(
                folders = uiState.folders,
                onToggle = viewModel::toggleFolder,
                onDelete = viewModel::deleteFolder,
                onUpdate = viewModel::updateFolder,
                onRescan = viewModel::refreshPending,
                onAdd = { directoryPicker.launch(null) },
                scanningIds = uiState.scanningIds,
                canAdd = uiState.hasPermission
            )
        }
    }
}

@Composable
private fun PermissionCard(
    state: BackupPermissionUiState,
    onRequestPermission: () -> Unit,
    onRecheck: () -> Unit
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val iconColor = if (state.hasPermission) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant
                Icon(
                    imageVector = if (state.hasPermission) Icons.Filled.CheckCircle else Icons.Filled.Lock,
                    contentDescription = null,
                    tint = iconColor
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "本机文件访问权限",
                        style = MaterialTheme.typography.titleMedium
                    )
                    if (state.hasPermission) {
                        Text(
                            text = "已获得访问本机文件权限，可用于备份。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (state.grantedRoots.isNotEmpty()) {
                            Text(
                                text = "授权目录：${state.grantedRoots.first()}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        Text(
                            text = "请选择可访问的顶层目录，后续会在该目录下递归扫描需要备份的媒体。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FilledTonalButton(
                    onClick = onRequestPermission,
                    enabled = !state.isRefreshing
                ) {
                    Icon(imageVector = Icons.Filled.Folder, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (state.hasPermission) "重新授权" else "申请文件权限")
                }
                OutlinedButton(
                    onClick = onRecheck,
                    enabled = !state.isRefreshing
                ) {
                    Icon(imageVector = Icons.Filled.Refresh, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("重新检测")
                }
            }
        }
    }
}

@Composable
private fun FolderList(
    folders: List<BackupFolderUi>,
    onToggle: (Long, Boolean) -> Unit,
    onDelete: (Long) -> Unit,
    onUpdate: (Long, String) -> Unit,
    onRescan: (Long) -> Unit,
    onAdd: () -> Unit,
    scanningIds: Set<Long>,
    canAdd: Boolean
) {
    var editing by remember { mutableStateOf<BackupFolderUi?>(null) }

    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "备份目录",
                style = MaterialTheme.typography.titleMedium
            )
            if (folders.isEmpty()) {
                OutlinedButton(
                    onClick = onAdd,
                    enabled = canAdd,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(imageVector = Icons.Filled.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("添加目录")
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    folders.forEach { folder ->
                        FolderItem(
                            folder = folder,
                            onToggle = onToggle,
                            onDelete = onDelete,
                            onEdit = { editing = it },
                            onRescan = onRescan,
                            isScanning = scanningIds.contains(folder.id)
                        )
                    }
                }
                OutlinedButton(
                    onClick = onAdd,
                    enabled = canAdd,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(imageVector = Icons.Filled.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("添加目录")
                }
                if (!canAdd) {
                    Text(
                        text = "需先授予文件访问权限后才能添加目录。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }

    editing?.let { folder ->
        FolderEditDialog(
            folder = folder,
            onDismiss = { editing = null },
            onConfirm = { name ->
                onUpdate(folder.id, name)
                editing = null
            }
        )
    }
}

@Composable
private fun FolderItem(
    folder: BackupFolderUi,
    onToggle: (Long, Boolean) -> Unit,
    onDelete: (Long) -> Unit,
    onEdit: (BackupFolderUi) -> Unit,
    onRescan: (Long) -> Unit,
    isScanning: Boolean
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
        )
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(
                    imageVector = Icons.Filled.Folder,
                    contentDescription = null,
                    tint = if (folder.enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Column {
                    Text(
                        text = folder.name,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium)
                    )
                    val pendingText = if (folder.pending > 0) "待上传 ${folder.pending} 项" else "暂无待上传"
                    Text(
                        text = pendingText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = folder.lastScanAt?.let { "上次扫描：${formatDateTime(it)}" } ?: "尚未扫描",
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                androidx.compose.material3.Switch(
                    checked = folder.enabled,
                    enabled = !isScanning,
                    onCheckedChange = { onToggle(folder.id, it) }
                )
                if (isScanning) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                } else {
                    IconButton(onClick = { onRescan(folder.id) }) {
                        Icon(imageVector = Icons.Filled.Refresh, contentDescription = "重新扫描")
                    }
                }
                IconButton(onClick = { onEdit(folder) }, enabled = !isScanning) {
                    Icon(imageVector = Icons.Filled.Edit, contentDescription = "重命名")
                }
                IconButton(onClick = { onDelete(folder.id) }, enabled = !isScanning) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = "删除"
                    )
                }
            }
        }
    }
}

private fun formatDateTime(timestampMillis: Long): String {
    val formatter = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault())
    return formatter.format(java.util.Date(timestampMillis))
}

@Composable
private fun FolderEditDialog(
    folder: BackupFolderUi,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var name by rememberSaveable(folder.id) { mutableStateOf(folder.name) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("编辑目录") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("别名") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(name.ifBlank { folder.name }) }) {
                Text("保存")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消")
            }
        }
    )
}
