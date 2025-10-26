package com.example.androidclient.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.paging.LoadState
import androidx.paging.compose.LazyPagingItems
import androidx.paging.compose.itemKey
import com.example.androidclient.data.model.MediaItem

@Composable
fun MediaGrid(
    items: LazyPagingItems<MediaItem>,
    onThumbnailClick: (Int) -> Unit,
    modifier: Modifier = Modifier,
    gridContentDescription: String = "Thumbnail Grid",
    emptyContent: (@Composable () -> Unit)? = null
) {
    when (items.loadState.refresh) {
        is LoadState.Loading -> Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) { CircularProgressIndicator() }

        is LoadState.Error -> {
            val error = (items.loadState.refresh as LoadState.Error).error
            Box(
                modifier = modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = "加载失败：${error.message}")
                    Button(onClick = { items.retry() }) { Text("重试") }
                }
            }
        }

        else -> {
            if (items.itemCount == 0 && emptyContent != null) {
                emptyContent()
                return
            }
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 108.dp),
                contentPadding = PaddingValues(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = modifier
                    .fillMaxSize()
                    .semantics { contentDescription = gridContentDescription }
            ) {
                items(
                    count = items.itemCount,
                    key = items.itemKey { it.id }
                ) { index ->
                    val item = items[index]
                    if (item != null) {
                        ThumbnailItem(item) { onThumbnailClick(index) }
                    }
                }

                when (items.loadState.append) {
                    is LoadState.Loading -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) { CircularProgressIndicator() }
                        }
                    }
                    is LoadState.Error -> {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Button(onClick = { items.retry() }) {
                                    Text("加载更多失败，点击重试")
                                }
                            }
                        }
                    }
                    else -> Unit
                }
            }
        }
    }
}

@Composable
private fun ThumbnailItem(item: MediaItem, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .aspectRatio(1f)
            .semantics { contentDescription = "Thumbnail Item" },
        shape = MaterialTheme.shapes.small
    ) {
        ThumbnailImage(
            data = item.thumbnailUrl.takeUnless { it.isNullOrBlank() } ?: item.resourceUrl,
            contentDescription = item.filename,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            targetSize = 108.dp
        )
    }
}
