package com.example.androidclient.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import com.example.androidclient.data.model.tasks.ScanTaskState
import com.example.androidclient.data.model.tasks.ScanTaskStatusResponse
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TasksScreen(
    viewModel: TasksViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("任务进度") },
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
        }
    ) { innerPadding ->
        when (val state = uiState) {
            TaskUiState.Loading -> LoadingContent(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            )

            is TaskUiState.Error -> ErrorContent(
                message = state.message,
                onRetry = { viewModel.refresh(force = true) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            )

            is TaskUiState.Success -> SuccessContent(
                status = state.data,
                onRefresh = { viewModel.refresh(force = true) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            )
        }
    }
}

@Composable
private fun LoadingContent(modifier: Modifier = Modifier) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorContent(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(
                imageVector = Icons.Filled.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
            FilledTonalButton(onClick = onRetry) {
                Icon(imageVector = Icons.Filled.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("重试")
            }
        }
    }
}

@Composable
private fun SuccessContent(
    status: ScanTaskStatusResponse,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val numberFormatter = remember { NumberFormat.getIntegerInstance(Locale.getDefault()) }
    val formattedUpdatedAt = remember(status.generatedAt) {
        runCatching {
            val zoned = OffsetDateTime.parse(status.generatedAt)
                .atZoneSameInstant(ZoneId.systemDefault())
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(zoned)
        }.getOrDefault(status.generatedAt)
    }

    Column(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        when (status.state) {
            ScanTaskState.NO_MEDIA_ROOT -> {
                OutlinedCard(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.outlinedCardColors()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "尚未配置媒体目录",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "请先在连接流程中选择媒体目录，初始化完成后再查看扫描任务进度。",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        FilledTonalButton(onClick = onRefresh) {
                            Icon(imageVector = Icons.Filled.Refresh, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("刷新状态")
                        }
                    }
                }
            }

            ScanTaskState.ERROR -> {
                OutlinedCard(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.outlinedCardColors()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "无法读取媒体目录",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = status.message ?: "请检查服务器上的媒体目录是否仍然可访问。",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        FilledTonalButton(onClick = onRefresh) {
                            Icon(imageVector = Icons.Filled.Refresh, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("重新尝试")
                        }
                    }
                }
            }

            ScanTaskState.READY -> {
                val remaining = status.remainingCount
                val total = status.totalDiscovered
                val scanned = status.scannedCount
                val remainingText = remaining?.let { numberFormatter.format(it) } ?: "未知"
                val totalText = total?.let { numberFormatter.format(it) } ?: "未知"
                val previewBatchText = numberFormatter.format(status.previewBatchSize)
                val scannedText = numberFormatter.format(scanned)
                ElevatedCard(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "剩余待扫描媒体",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = remainingText,
                            style = MaterialTheme.typography.displayMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "已入库：$scannedText",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = "目录总量：$totalText",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        Text(
                            text = "首批仅预扫描 $previewBatchText 个文件，用于快速响应，剩余文件将由后台任务陆续处理。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (status.message != null) {
                            Text(
                                text = status.message,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        FilledTonalButton(onClick = onRefresh) {
                            Icon(imageVector = Icons.Filled.Refresh, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("刷新数据")
                        }
                        Text(
                            text = "更新于 $formattedUpdatedAt",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
