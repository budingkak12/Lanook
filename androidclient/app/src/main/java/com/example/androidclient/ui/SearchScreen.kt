package com.example.androidclient.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.paging.LoadState
import androidx.paging.compose.collectAsLazyPagingItems
import coil3.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.request.ImageRequest
import com.example.androidclient.data.model.MediaItem
import androidx.compose.material3.Card
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

@Composable
fun SearchScreen(
    navController: NavController,
    mainViewModel: MainViewModel,
    searchViewModel: SearchViewModel
) {
    var input by remember { mutableStateOf("") }
    val selectedTagState = searchViewModel.selectedTag
    val selectedTag = selectedTagState.value

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            singleLine = true,
            placeholder = { Text("输入标签，如 like / favorite") }
        )

        Button(
            onClick = { searchViewModel.setTag(input) },
            modifier = Modifier
                .padding(horizontal = 12.dp)
                .fillMaxWidth()
        ) {
            Text("搜索")
        }

        if (selectedTag == null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { Text("请输入标签进行搜索") }
        } else {
            val items = searchViewModel.thumbnails.collectAsLazyPagingItems()
            when (items.loadState.refresh) {
                is LoadState.Loading -> Box(
                    modifier = Modifier
                        .fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }

                is LoadState.Error -> {
                    val error = (items.loadState.refresh as LoadState.Error).error
                    Box(
                        modifier = Modifier
                            .fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(text = "加载失败：${error.message}")
                            Button(onClick = { items.retry() }) { Text("重试") }
                        }
                    }
                }

                else -> {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 108.dp),
                        contentPadding = PaddingValues(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .semantics { contentDescription = "Search Thumbnail Grid" }
                    ) {
                        items(items.itemCount) { index ->
                            val item = items[index]
                            if (item != null) {
                                SearchThumbnailItem(item) {
                                    navController.navigate("search-details/$index")
                                }
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
                                        Button(onClick = { items.retry() }) { Text("加载更多失败，点击重试") }
                                    }
                                }
                            }
                            else -> Unit
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchThumbnailItem(item: MediaItem, onClick: () -> Unit) {
    Card(onClick = onClick) {
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(item.thumbnailUrl ?: item.resourceUrl)
                .build(),
            contentDescription = item.filename,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Search Thumbnail Item" }
        )
    }
}
