package com.example.androidclient.ui.setup

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.androidclient.data.model.setup.DirectoryEntry
import com.example.androidclient.data.model.setup.InitializationState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChooseMediaPathScreen(
    viewModel: SetupViewModel,
    onInitialized: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(Unit) {
        viewModel.loadInitial()
        viewModel.events.collect { event ->
            if (event is SetupEvent.Initialized) {
                onInitialized()
            }
        }
    }

    LaunchedEffect(uiState.errorMessage) {
        val message = uiState.errorMessage
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            viewModel.clearError()
        }
    }

    val currentPath = uiState.currentPath
    val parentPath = uiState.parentPath

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(text = "选择媒体目录") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            Surface(shadowElevation = 8.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            if (currentPath != null) {
                                parentPath?.let { viewModel.goParent() } ?: viewModel.openRoots()
                            } else {
                                viewModel.openRoots()
                            }
                        },
                        modifier = Modifier.weight(1f),
                        enabled = currentPath != null || uiState.roots.isNotEmpty()
                    ) {
                        val label = when {
                            currentPath == null -> "返回根目录"
                            parentPath != null -> "返回上一级"
                            else -> "返回根目录"
                        }
                        Text(text = label)
                    }
                    Button(
                        onClick = { viewModel.confirmSelection() },
                        enabled = currentPath != null && !uiState.isSubmitting,
                        modifier = Modifier.weight(1f)
                    ) {
                        if (uiState.isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Text("选择当前文件夹")
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "请选择电脑上的媒体文件夹，初始化完成后才能进入首页。",
                style = MaterialTheme.typography.bodyMedium
            )

            // 固定的"当前目录"标题，不随文件夹切换而刷新
            Text(
                text = "当前目录",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (uiState.isLoading) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator()
                }
            }

            if (currentPath != null) {
                Text(
                    text = currentPath,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
            } else {
                Text(
                    text = "可选根目录",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            val entries: List<DirectoryEntry> =
                if (currentPath == null) uiState.roots else uiState.entries

            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(entries, key = { it.path }) { entry ->
                    DirectoryRow(entry = entry) {
                        viewModel.enterDirectory(entry.path)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DirectoryRow(entry: DirectoryEntry, onClick: () -> Unit) {
    ListItem(
        headlineContent = {
            Text(text = if (entry.name.isNotBlank()) entry.name else entry.path)
        },
        supportingContent = {
            Text(text = entry.path)
        },
        leadingContent = {
            Icon(imageVector = Icons.Default.Folder, contentDescription = null)
        },
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
    )
    Divider(modifier = Modifier.padding(horizontal = 16.dp))
}
