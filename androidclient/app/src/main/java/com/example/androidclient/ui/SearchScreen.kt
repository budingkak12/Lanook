package com.example.androidclient.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.clickable
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.paging.compose.collectAsLazyPagingItems
import com.example.androidclient.data.model.TagOption
import com.example.androidclient.ui.components.MediaGrid

@Composable
fun SearchScreen(
    navController: NavController,
    searchViewModel: SearchViewModel
) {
    var input by remember { mutableStateOf("") }
    val selectedTag by searchViewModel.selectedTag.collectAsState()
    val allTags by searchViewModel.allTags.collectAsState()

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
            onClick = {
                val resolved = resolveInputToName(input, allTags) ?: input
                searchViewModel.setTag(resolved)
            },
            modifier = Modifier
                .padding(horizontal = 12.dp)
                .fillMaxWidth()
        ) {
            Text("搜索")
        }

        // 本地联想：基于译文+原文的显示文本做 substring 过滤
        val suggestList = remember(input, allTags) {
            val kw = input.trim().lowercase()
            if (kw.isEmpty()) emptyList() else allTags.filter { it.displayText().lowercase().contains(kw) }.take(12)
        }
        if (suggestList.isNotEmpty()) {
            SuggestionList(
                suggestions = suggestList,
                onPick = { opt ->
                    // 选中即触发搜索；input 显示 "译文 : 原文"，搜索使用原文 name
                    input = opt.displayText()
                    searchViewModel.setTag(opt.name)
                }
            )
        }

        if (selectedTag == null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { Text("请输入标签进行搜索") }
        } else {
            val items = searchViewModel.thumbnails.collectAsLazyPagingItems()
            MediaGrid(
                items = items,
                onThumbnailClick = { index ->
                    navController.navigate("search-details/$index")
                },
                gridContentDescription = "Search Thumbnail Grid",
                emptyContent = {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) { Text("暂无结果") }
                }
            )
        }
    }
}

private fun resolveInputToName(input: String, options: List<TagOption>): String? {
    val trimmed = input.trim()
    if (trimmed.isEmpty()) return null
    // 完全匹配译文、原文或显示文本
    options.firstOrNull {
        val dt = it.displayText()
        trimmed.equals(it.name, ignoreCase = true) ||
            (it.displayName?.let { dn -> trimmed.equals(dn, ignoreCase = true) } ?: false) ||
            trimmed.equals(dt, ignoreCase = true)
    }?.let { return it.name }
    return null
}

@Composable
private fun SuggestionList(suggestions: List<TagOption>, onPick: (TagOption) -> Unit) {
    LazyColumn(modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 12.dp)
    ) {
        items(suggestions) { opt ->
            Column(modifier = Modifier
                .fillMaxWidth()
                .clickable { onPick(opt) }
                .padding(vertical = 8.dp)
            ) {
                Text(text = opt.displayText(), style = MaterialTheme.typography.bodyLarge)
            }
            HorizontalDivider()
        }
        item { Spacer(modifier = Modifier.height(4.dp)) }
    }
}
