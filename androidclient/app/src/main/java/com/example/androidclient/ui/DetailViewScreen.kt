package com.example.androidclient.ui

import androidx.compose.runtime.Composable
import androidx.paging.compose.LazyPagingItems
import com.example.androidclient.data.model.MediaItem

@Composable
fun DetailViewScreen(
    viewModel: MainViewModel,
    items: LazyPagingItems<MediaItem>,
    initialIndex: Int,
    onBack: () -> Unit
) {
    com.example.androidclient.ui.components.DetailViewScreen(
        viewModel = viewModel,
        items = items,
        initialIndex = initialIndex,
        onBack = onBack
    )
}
