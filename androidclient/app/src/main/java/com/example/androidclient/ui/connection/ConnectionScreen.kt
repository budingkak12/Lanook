package com.example.androidclient.ui.connection

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import io.github.g00fy2.quickie.QRResult
import io.github.g00fy2.quickie.ScanQRCode

@Composable
fun ConnectionScreen(
    viewModel: ConnectionViewModel,
    onConnected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    var pendingScan by remember { mutableStateOf(false) }

    val qrLauncher = rememberLauncherForActivityResult(ScanQRCode()) { result ->
        pendingScan = false
        when (result) {
            is QRResult.QRSuccess -> {
                val value = result.content.rawValue
                if (!value.isNullOrBlank()) {
                    viewModel.onScanResult(value)
                } else {
                    viewModel.onScanResult("")
                }
            }
            is QRResult.QRUserCanceled -> Unit
            is QRResult.QRMissingPermission -> viewModel.onCameraPermissionDenied()
            is QRResult.QRError -> viewModel.onScanResult(result.exception?.message ?: "")
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        pendingScan = false
        if (granted) {
            qrLauncher.launch(null)
        } else {
            viewModel.onCameraPermissionDenied()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ConnectionEvent.Connected -> onConnected(event.baseUrl)
            }
        }
    }

    LaunchedEffect(state.cameraPermissionDenied) {
        if (state.cameraPermissionDenied) {
            snackbarHostState.showSnackbar("需要相机权限才能扫码")
            viewModel.consumeCameraPermissionNotice()
        }
    }

    LaunchedEffect(state.errorMessage) {
        val message = state.errorMessage
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
        }
    }

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text(
                text = "连接到局域网媒体库",
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.SemiBold)
            )
            Text(
                text = "请确保手机与服务器同处一个局域网，可以扫描电脑端展示的二维码，或手动输入 IP 地址和端口。",
                style = MaterialTheme.typography.bodyMedium,
                overflow = TextOverflow.Ellipsis
            )

            OutlinedTextField(
                value = state.baseUrlInput,
                onValueChange = viewModel::onInputChanged,
                label = { Text("服务器地址") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            if (state.isChecking) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.5.dp
                    )
                    Text("正在验证服务器...")
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = {
                        val permissionStatus = ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.CAMERA
                        )
                        if (permissionStatus == PackageManager.PERMISSION_GRANTED) {
                            qrLauncher.launch(null)
                        } else if (!pendingScan) {
                            pendingScan = true
                            permissionLauncher.launch(Manifest.permission.CAMERA)
                        }
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("扫码填入")
                }
                OutlinedButton(
                    onClick = { viewModel.autoDetect() },
                    modifier = Modifier.weight(1f),
                    enabled = !state.isChecking
                ) {
                    Text("自动探测")
                }
            }

            Button(
                onClick = { viewModel.connect() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.isChecking
            ) {
                Text("确认连接")
            }

            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "提示：后端 FastAPI 控制台会显示二维码，也可以访问 /connect-info 页面查看更多地址。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
