package com.example.androidclient.ui.components

import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.paging.compose.LazyPagingItems
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.example.androidclient.data.model.MediaItem
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.MainViewModel.TagState
import com.example.androidclient.ui.VideoPlayer
import net.engawapg.lib.zoomable.rememberZoomState
import net.engawapg.lib.zoomable.zoomable

private const val DETAIL_TAG = "UnifiedMediaViewer"

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DetailViewScreen(
    viewModel: MainViewModel,
    items: LazyPagingItems<MediaItem>,
    initialIndex: Int,
    onBack: () -> Unit
) {
    val savedPageState = rememberSaveable(initialIndex) { mutableStateOf(initialIndex) }
    val pagerState = rememberPagerState(
        initialPage = savedPageState.value,
        pageCount = { items.itemCount }
    )
    LaunchedEffect(pagerState.currentPage) {
        if (savedPageState.value != pagerState.currentPage) {
            savedPageState.value = pagerState.currentPage
        }
    }
    val overrides by viewModel.tagOverrides.collectAsState()
    val context = LocalContext.current
    val density = LocalDensity.current
    var showDeleteDialog by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val bottomInset = with(density) { WindowInsets.systemBars.getBottom(this).toDp() }
    val topInset = with(density) { WindowInsets.systemBars.getTop(this).toDp() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Detail View" }
    ) {
        val bottomInset = with(density) { WindowInsets.systemBars.getBottom(this).toDp() }
        val topInset = with(density) { WindowInsets.systemBars.getTop(this).toDp() }

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            if (page < items.itemCount) {
                val item = items[page]
                if (item != null) {
                    val override: TagState? = overrides[item.id]
                    val liked = override?.liked ?: (item.liked ?: false)
                    val favorited = override?.favorited ?: (item.favorited ?: false)

                    var likeLoading by remember(item.id) { mutableStateOf(false) }
                    var favoriteLoading by remember(item.id) { mutableStateOf(false) }

                    val toggleLike: () -> Unit = {
                        if (!likeLoading) {
                            likeLoading = true
                            viewModel.setLike(item.id, !liked) { result ->
                                likeLoading = false
                                result.onFailure {
                                    Toast.makeText(context, it.localizedMessage ?: "点赞失败", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    }

                    val toggleFavorite: () -> Unit = {
                        if (!favoriteLoading) {
                            favoriteLoading = true
                            viewModel.setFavorite(item.id, !favorited) { result ->
                                favoriteLoading = false
                                result.onFailure {
                                    Toast.makeText(context, it.localizedMessage ?: "收藏失败", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    }

                    SingleMediaPage(
                        resourceUrl = item.resourceUrl,
                        type = item.type,
                        filename = item.filename,
                        liked = liked,
                        favorited = favorited,
                        likeLoading = likeLoading,
                        favoriteLoading = favoriteLoading,
                        onToggleLike = toggleLike,
                        onToggleFavorite = toggleFavorite,
                        bottomInset = bottomInset
                    )
                }
            }
        }

        // Top Controls
        Box(modifier = Modifier.fillMaxSize()) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .padding(start = 16.dp, top = topInset + 12.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f))
                    .align(Alignment.TopStart)
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
            }

            IconButton(
                onClick = { if (!deleting) showDeleteDialog = true },
                modifier = Modifier
                    .padding(end = 16.dp, top = topInset + 12.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.5f))
                    .align(Alignment.TopEnd)
            ) {
                Icon(Icons.Filled.Delete, "删除", tint = Color.White)
            }
        }

        if (showDeleteDialog) {
            val currentIndex = pagerState.currentPage
            val currentItem = if (currentIndex < items.itemCount) items[currentIndex] else null
            
            if (currentItem != null) {
                DeleteConfirmDialog(
                    isDeleting = deleting,
                    onDismiss = { if (!deleting) showDeleteDialog = false },
                    onConfirm = {
                        deleting = true
                        showDeleteDialog = false
                        viewModel.deleteMedia(setOf(currentItem.id)) { result ->
                            deleting = false
                            if (result.successIds.contains(currentItem.id)) {
                                Toast.makeText(context, "已删除", Toast.LENGTH_SHORT).show()
                                // No refresh needed, upstream flow handles it
                            } else {
                                Toast.makeText(context, "删除失败", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.deletionEvents.collect { ids ->
            val currentIndex = pagerState.currentPage
            if (currentIndex < items.itemCount) {
                val currentItem = items[currentIndex]
                if (currentItem != null && ids.contains(currentItem.id)) {
                    items.refresh()
                    // Simple retry logic to wait for refresh
                    var tries = 0
                    while (tries < 20) {
                        if (items.loadState.refresh !is androidx.paging.LoadState.Loading) break
                        kotlinx.coroutines.delay(100)
                        tries++
                    }
                    if (items.itemCount == 0) onBack()
                }
            }
        }
    }
}

@Composable
fun SingleMediaPage(
    resourceUrl: String,
    type: String,
    filename: String,
    liked: Boolean,
    favorited: Boolean,
    likeLoading: Boolean = false,
    favoriteLoading: Boolean = false,
    onToggleLike: () -> Unit,
    onToggleFavorite: () -> Unit,
    bottomInset: androidx.compose.ui.unit.Dp
) {
    val context = LocalContext.current
    val toggleLikeState = rememberUpdatedState(onToggleLike)
    var controllerVisible by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        when (type) {
            "image" -> {
                val zoomState = rememberZoomState()
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(resourceUrl)
                        .size(coil3.size.Size.ORIGINAL)
                        .build(),
                    contentDescription = filename,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .zoomable(
                            zoomState = zoomState,
                            enableOneFingerZoom = false,
                            onDoubleTap = {
                                toggleLikeState.value.invoke()
                            }
                        )
                )
            }
            "video" -> {
                VideoPlayer(
                    url = resourceUrl,
                    modifier = Modifier.fillMaxSize(),
                    onDoubleTap = { toggleLikeState.value.invoke() },
                    onControllerVisibilityChanged = { visible ->
                        controllerVisible = visible
                    }
                )
            }
        }

        val hideBar = type == "video" && controllerVisible
        if (!hideBar) {
            LikeFavoriteBar(
                liked = liked,
                favorited = favorited,
                likeLoading = likeLoading,
                favoriteLoading = favoriteLoading,
                onToggleLike = onToggleLike,
                onToggleFavorite = onToggleFavorite,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = bottomInset + 24.dp)
            )
        }
    }
}

@Composable
fun DeleteConfirmDialog(
    isDeleting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("删除确认") },
        text = { Text("确定删除当前媒体吗？此操作不可恢复。") },
        confirmButton = {
            TextButton(enabled = !isDeleting, onClick = onConfirm) {
                Text("删除")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

@Composable
fun LikeFavoriteBar(
    liked: Boolean,
    favorited: Boolean,
    likeLoading: Boolean,
    favoriteLoading: Boolean,
    onToggleLike: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.35f), shape = CircleShape)
            .padding(horizontal = 24.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ActionIconButton(
            active = liked,
            activeTint = Color.Red,
            inactiveTint = Color.White,
            activeIcon = Icons.Filled.Favorite,
            inactiveIcon = Icons.Outlined.FavoriteBorder,
            contentDescription = if (liked) "取消点赞" else "点赞",
            loading = likeLoading,
            onClick = onToggleLike
        )
        ActionIconButton(
            active = favorited,
            activeTint = Color(0xFFFFC107),
            inactiveTint = Color.White,
            activeIcon = Icons.Filled.Bookmark,
            inactiveIcon = Icons.Outlined.BookmarkBorder,
            contentDescription = if (favorited) "取消收藏" else "收藏",
            loading = favoriteLoading,
            onClick = onToggleFavorite
        )
    }
}

@Composable
fun ActionIconButton(
    active: Boolean,
    activeTint: Color,
    inactiveTint: Color,
    activeIcon: androidx.compose.ui.graphics.vector.ImageVector,
    inactiveIcon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    loading: Boolean,
    onClick: () -> Unit,
) {
    val tint = if (active) activeTint else inactiveTint
    val icon = if (active) activeIcon else inactiveIcon
    IconButton(
        onClick = onClick,
        enabled = !loading,
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.5f))
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = Color.White
            )
        } else {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint
            )
        }
    }
}
