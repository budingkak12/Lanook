package com.example.androidclient.ui.settings

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProgressIndicatorDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.CircleShape

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onViewTasks: () -> Unit
) {
    val autoScanState by viewModel.autoScanState.collectAsState()

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            SectionHeader(text = "自动化")
            AutoScanSettingItem(
                state = autoScanState,
                onToggle = viewModel::setAutoScanEnabled,
                onRetry = viewModel::refresh
            )
            HorizontalDivider(thickness = 0.5.dp)

            SectionHeader(text = "系统任务")
            SettingsItem(
                title = "扫描任务",
                description = "查看后台入库进度，确认剩余待扫描的媒体数量。",
                icon = Icons.AutoMirrored.Filled.ListAlt,
                onClick = onViewTasks
            )
            HorizontalDivider(thickness = 0.5.dp)
        }
    }
}

@Composable
private fun AutoScanSettingItem(
    state: AutoScanUiState,
    onToggle: (Boolean) -> Unit,
    onRetry: () -> Unit
) {
    val description = "开启后，服务器会实时监控媒体目录新增文件并自动写入数据库。"
    when (state) {
        AutoScanUiState.Loading -> {
            ListItem(
                headlineContent = { Text("开启自动扫描") },
                supportingContent = {
                    Text(description, style = MaterialTheme.typography.bodySmall)
                },
                trailingContent = {
                    AutoScanLoadingIndicator()
                }
            )
        }

        is AutoScanUiState.Error -> {
            ListItem(
                headlineContent = { Text("开启自动扫描") },
                supportingContent = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(description, style = MaterialTheme.typography.bodySmall)
                        Text(
                            text = state.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                },
                trailingContent = {
                    TextButton(onClick = onRetry) {
                        Text("重试")
                    }
                }
            )
        }

        is AutoScanUiState.Ready -> {
            val status = state.status
            ListItem(
                headlineContent = { Text("开启自动扫描") },
                supportingContent = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(description, style = MaterialTheme.typography.bodySmall)
                        status.message?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.tertiary
                            )
                        }
                        state.errorMessage?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                },
                trailingContent = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        val switchAlpha by animateFloatAsState(
                            targetValue = if (state.isUpdating) 0f else 1f,
                            animationSpec = tween(durationMillis = 150),
                            label = "AutoScanSwitchAlpha"
                        )
                        val indicatorAlpha by animateFloatAsState(
                            targetValue = if (state.isUpdating) 1f else 0f,
                            animationSpec = tween(durationMillis = 180),
                            label = "AutoScanIndicatorAlpha"
                        )
                        Box(
                            modifier = Modifier.size(width = 56.dp, height = 36.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Switch(
                                checked = status.enabled,
                                onCheckedChange = onToggle,
                                enabled = !state.isUpdating,
                                modifier = Modifier.alpha(switchAlpha)
                            )
                            if (indicatorAlpha > 0f) {
                                AutoScanLoadingIndicator(
                                    modifier = Modifier.alpha(indicatorAlpha),
                                    size = 28.dp
                                )
                            }
                        }
                    }
                }
            )
        }
    }
}

@Composable
private fun AutoScanLoadingIndicator(
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    shape: Shape = CircleShape
) {
    Surface(
        modifier = modifier.size(size),
        shape = shape,
        tonalElevation = 3.dp,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
    ) {
        Box(contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                strokeWidth = ProgressIndicatorDefaults.CircularStrokeWidth,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.size(size * 0.55f)
            )
        }
    }
}

@Composable
private fun SettingsItem(
    title: String,
    description: String,
    icon: ImageVector,
    onClick: () -> Unit
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(description, style = MaterialTheme.typography.bodySmall) },
        leadingContent = {
            androidx.compose.material3.Icon(
                imageVector = icon,
                contentDescription = null
            )
        },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp)
    )
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier
            .padding(start = 16.dp, top = 24.dp, bottom = 8.dp)
    )
}
