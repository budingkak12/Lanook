package com.example.androidclient.ui

import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.paging.compose.LazyPagingItems
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.example.androidclient.data.model.MediaItem
import net.engawapg.lib.zoomable.rememberZoomState
import net.engawapg.lib.zoomable.zoomable
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.MainViewModel.TagState

private const val DETAIL_TAG = "DetailViewScreen"

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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Detail View" }
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
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
                        Log.d(DETAIL_TAG, "toggleLike invoked. target=${!liked}, mediaId=${item.id}")
                        viewModel.setLike(item.id, !liked) { result ->
                            likeLoading = false
                            result.onFailure {
                                Log.e(DETAIL_TAG, "toggleLike failed for mediaId=${item.id}", it)
                                Toast.makeText(
                                    context,
                                    it.localizedMessage ?: "点赞失败，请稍后重试",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    }
                }

                val toggleFavorite: () -> Unit = {
                    if (!favoriteLoading) {
                        favoriteLoading = true
                        Log.d(DETAIL_TAG, "toggleFavorite invoked. target=${!favorited}, mediaId=${item.id}")
                        viewModel.setFavorite(item.id, !favorited) { result ->
                            favoriteLoading = false
                            result.onFailure {
                                Log.e(DETAIL_TAG, "toggleFavorite failed for mediaId=${item.id}", it)
                                Toast.makeText(
                                    context,
                                    it.localizedMessage ?: "收藏失败，请稍后重试",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    }
                }

                val toggleLikeState = rememberUpdatedState(toggleLike)
                var controllerVisible by remember(item.id) { mutableStateOf(false) }

                Box(modifier = Modifier.fillMaxSize()) {
                    when (item.type) {
                        "image" -> {
                            val zoomState = rememberZoomState()
                            AsyncImage(
                                model = ImageRequest.Builder(LocalContext.current)
                                    .data(item.resourceUrl)
                                    .build(),
                                contentDescription = item.filename,
                                contentScale = ContentScale.Fit,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .zoomable(
                                        zoomState = zoomState,
                                        enableOneFingerZoom = false,
                                        onDoubleTap = {
                                            Log.d(DETAIL_TAG, "zoomable onDoubleTap -> toggle like")
                                            toggleLikeState.value.invoke()
                                        }
                                    )
                            )
                        }
                        "video" -> {
                            VideoPlayer(
                                url = item.resourceUrl,
                                modifier = Modifier.fillMaxSize(),
                                onDoubleTap = { toggleLikeState.value.invoke() },
                                onControllerVisibilityChanged = { visible ->
                                    controllerVisible = visible
                                }
                            )
                        }
                    }

                    val hideBar = item.type == "video" && controllerVisible
                    if (!hideBar) {
                        LikeFavoriteBar(
                            liked = liked,
                            favorited = favorited,
                            likeLoading = likeLoading,
                            favoriteLoading = favoriteLoading,
                            onToggleLike = toggleLike,
                            onToggleFavorite = toggleFavorite,
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                // 抬高操作条，兼容虚拟按键/全面屏手势
                                .padding(bottom = bottomInset + 24.dp)
                        )
                    }
                }
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier
                .padding(16.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.5f))
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                tint = Color.White
            )
        }

        // 右上角删除按钮
        IconButton(
            onClick = { if (!deleting) showDeleteDialog = true },
            modifier = Modifier
                .padding(16.dp)
                .align(Alignment.TopEnd)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.5f))
        ) {
            Icon(
                imageVector = Icons.Filled.Delete,
                contentDescription = "删除",
                tint = Color.White
            )
        }

        if (showDeleteDialog) {
            val currentIndex = pagerState.currentPage
            val currentItem = items[currentIndex]
            AlertDialog(
                onDismissRequest = { if (!deleting) showDeleteDialog = false },
                title = { Text("删除确认") },
                text = { Text("确定删除当前媒体吗？此操作不可恢复。") },
                confirmButton = {
                    TextButton(
                        enabled = !deleting,
                        onClick = {
                            val id = currentItem?.id ?: return@TextButton
                            deleting = true
                            showDeleteDialog = false
                            viewModel.deleteMedia(setOf(id)) { result ->
                                deleting = false
                                if (result.successIds.contains(id)) {
                                    Toast.makeText(context, "已删除", Toast.LENGTH_SHORT).show()
                                    // 不再调用 refresh；由上游过滤删除项，当前索引将显示下一项
                                } else {
                                    val reason = result.failed.firstOrNull()?.second?.message?.lowercase()
                                    val friendly = when {
                                        reason?.contains("read-only") == true || reason?.contains("readonly") == true ->
                                            "删除失败：后端数据库只读，请检查服务器目录写权限"
                                        reason?.contains("commit_failed") == true ->
                                            "删除失败：后端数据库提交失败，可能被占用或无写权限"
                                        else -> null
                                    }
                                    Toast.makeText(context, friendly ?: "删除失败", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    ) { Text("删除") }
                },
                dismissButton = {
                    TextButton(onClick = { if (!deleting) showDeleteDialog = false }) { Text("取消") }
                }
            )
        }
    }

    // 监听跨页面删除事件：若当前展示项被删，刷新并保持页号不变；若无可显示项则返回上一页
    LaunchedEffect(Unit) {
        viewModel.deletionEvents.collect { ids ->
            val currentIndex = pagerState.currentPage
            val currentItem = items[currentIndex]
            if (currentItem != null && ids.contains(currentItem.id)) {
                items.refresh()
                // 等待刷新完成（最多 ~5s），并在无内容时退出
                var tries = 0
                while (tries < 50) {
                    if (items.loadState.refresh !is androidx.paging.LoadState.Loading) break
                    kotlinx.coroutines.delay(100)
                    tries++
                }
                if (items.itemCount == 0) {
                    onBack()
                } else {
                    val maxIndex = items.itemCount - 1
                    if (pagerState.currentPage > maxIndex) {
                        try { pagerState.scrollToPage(maxIndex) } catch (_: Throwable) {}
                    }
                }
            }
        }
    }
}

@Composable
private fun LikeFavoriteBar(
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
private fun ActionIconButton(
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
