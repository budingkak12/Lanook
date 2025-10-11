package com.example.mytikt_androidclient.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mytikt_androidclient.data.model.MediaItem
import com.example.mytikt_androidclient.ui.components.ZoomableImage
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.max

@Composable
fun HomeRoute(
    viewModel: HomeViewModel = viewModel(
        factory = HomeViewModel.factory(LocalContext.current)
    )
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.errorMessage) {
        val message = uiState.errorMessage
        if (message != null) {
            snackbarHostState.showSnackbar(message)
            viewModel.dismissError()
        }
    }

    HomeScreen(
        state = uiState,
        snackbarHostState = snackbarHostState,
        onPageChanged = viewModel::onPageChanged,
        onLikeClick = { viewModel.toggleTag(HomeViewModel.MediaTag.LIKE) },
        onFavoriteClick = { viewModel.toggleTag(HomeViewModel.MediaTag.FAVORITE) },
        onDeleteClick = viewModel::deleteCurrent,
        onRefresh = viewModel::refresh,
        onPlaybackProgress = viewModel::onPlaybackProgress,
        onPlaybackEnded = viewModel::onPlaybackEnded
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    state: HomeViewModel.HomeUiState,
    snackbarHostState: SnackbarHostState,
    onPageChanged: (Int) -> Unit,
    onLikeClick: () -> Unit,
    onFavoriteClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onRefresh: () -> Unit,
    onPlaybackProgress: (Long, Long) -> Unit,
    onPlaybackEnded: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val isZooming = remember { mutableStateOf(false) }
    val pageCount = max(state.items.size, 1)
    val pagerState = rememberPagerState(
        initialPage = state.currentIndex.coerceIn(0, pageCount - 1),
        pageCount = { pageCount }
    )

    LaunchedEffect(state.items.size) {
        val safeIndex = state.currentIndex.coerceIn(0, max(state.items.size - 1, 0))
        if (state.items.isEmpty()) {
            pagerState.scrollToPage(0)
        } else {
            pagerState.scrollToPage(safeIndex)
        }
    }

    LaunchedEffect(state.currentIndex, state.items.size) {
        if (state.items.isEmpty()) return@LaunchedEffect
        val desired = state.currentIndex.coerceIn(0, state.items.size - 1)
        if (pagerState.currentPage != desired) {
            pagerState.animateScrollToPage(desired)
        }
    }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }
            .filter { state.items.isNotEmpty() && it < state.items.size }
            .distinctUntilChanged()
            .collect { newPage -> onPageChanged(newPage) }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = Color(0xFF111111),
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center
        ) {
            when {
                state.isLoading && state.items.isEmpty() -> {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }

                state.items.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("\u6682\u65e0\u5185\u5bb9", color = Color.White)
                        Spacer(modifier = Modifier.height(12.dp))
                        TextButton(onClick = onRefresh) {
                            Text("\u5237\u65b0\u8bd5\u8bd5")
                        }
                    }
                }

                else -> {
                    HorizontalPager(
                        state = pagerState,
                        userScrollEnabled = !isZooming.value,
                        modifier = Modifier.fillMaxSize()
                    ) { page ->
                        val item = state.items.getOrNull(page)
                        if (item != null) {
                            val isActive = state.currentIndex == page
                            val playback = state.playbackPositions[item.id] ?: 0L
                            MediaPage(
                                item = item,
                                isActive = isActive,
                                playbackPositionMs = playback,
                                onPlaybackProgress = { pos -> onPlaybackProgress(item.id, pos) },
                                onPlaybackEnded = { onPlaybackEnded(item.id) },
                                onTransformingChanged = { active -> isZooming.value = active }
                            )
                        }
                    }

                    val currentItem = state.items.getOrNull(state.currentIndex)
                    if (currentItem != null) {
                        MediaOverlay(
                            item = currentItem,
                            index = state.currentIndex,
                            total = state.items.size,
                            isDeleting = state.isDeleting,
                            onLikeClick = onLikeClick,
                            onFavoriteClick = onFavoriteClick,
                            onDeleteClick = onDeleteClick
                        )
                    }

                    val helperText = if (state.isPaging) "\u52a0\u8f7d\u66f4\u591a\u4e2d..." else "\u5de6\u6ed1\u4e0b\u4e00\u5f20\uff0c\u53f3\u6ed1\u4e0a\u4e00\u5f20"
                    Text(
                        text = helperText,
                        color = Color.White.copy(alpha = 0.6f),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 24.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun MediaPage(
    item: MediaItem,
    isActive: Boolean,
    playbackPositionMs: Long,
    onPlaybackProgress: (Long) -> Unit,
    onPlaybackEnded: () -> Unit,
    onTransformingChanged: (Boolean) -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        if (item.isImage) {
            ZoomableImage(
                imageUrl = item.resourceUrl,
                contentDescription = item.filename,
                modifier = Modifier.fillMaxSize(),
                onTransformingChanged = onTransformingChanged
            )
        } else {
            LaunchedEffect(item.id) {
                onTransformingChanged(false)
            }
            VideoPlayer(
                url = item.resourceUrl,
                isActive = isActive,
                playbackPositionMs = playbackPositionMs,
                onPlaybackPositionChange = onPlaybackProgress,
                onPlaybackEnded = onPlaybackEnded,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
private fun BoxScope.MediaOverlay(
    item: MediaItem,
    index: Int,
    total: Int,
    isDeleting: Boolean,
    onLikeClick: () -> Unit,
    onFavoriteClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .padding(16.dp)
            .align(Alignment.TopStart),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Column {
            Text(
                text = item.filename,
                color = Color.White,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = formatTimestamp(item.createdAt),
                color = Color.White.copy(alpha = 0.8f),
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = "${index + 1} / $total",
                color = Color.White.copy(alpha = 0.8f),
                style = MaterialTheme.typography.bodySmall
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onLikeClick) {
                Text(if (item.liked == true) "\u53d6\u6d88\u70b9\u8d5e" else "\u70b9\u8d5e")
            }
            Button(onClick = onFavoriteClick) {
                Text(if (item.favorited == true) "\u53d6\u6d88\u6536\u85cf" else "\u6536\u85cf")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = onDeleteClick, enabled = !isDeleting) {
                Text(if (isDeleting) "\u5220\u9664\u4e2d..." else "\u5220\u9664")
            }
        }
    }
}

private fun formatTimestamp(raw: String?): String {
    if (raw.isNullOrBlank()) return "--"
    return runCatching {
        val instant = Instant.parse(raw)
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
        formatter.withZone(ZoneId.systemDefault()).format(instant)
    }.getOrElse { raw }
}
