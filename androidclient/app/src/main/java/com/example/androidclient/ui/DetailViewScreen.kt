package com.example.androidclient.ui

import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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
    val pagerState = rememberPagerState(initialPage = initialIndex, pageCount = { items.itemCount })
    val overrides by viewModel.tagOverrides.collectAsState()
    val context = LocalContext.current

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
                                .padding(bottom = 32.dp)
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

