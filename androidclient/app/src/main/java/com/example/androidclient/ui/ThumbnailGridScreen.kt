package com.example.androidclient.ui

import androidx.compose.runtime.Composable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.paging.compose.collectAsLazyPagingItems
import com.example.androidclient.ui.components.MediaGrid
import com.example.androidclient.data.model.MediaItem
import androidx.paging.compose.LazyPagingItems

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThumbnailGridScreen(viewModel: MainViewModel, onThumbnailClick: (Int) -> Unit) {
    val items: LazyPagingItems<MediaItem> = viewModel.thumbnails.collectAsLazyPagingItems()
    MediaGrid(
        items = items,
        onThumbnailClick = onThumbnailClick,
        gridContentDescription = "Thumbnail Grid"
    )
}
