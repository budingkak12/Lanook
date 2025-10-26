package com.example.androidclient.ui.components

import android.util.Log
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.paging.LoadState
import androidx.paging.compose.LazyPagingItems
import androidx.paging.compose.itemKey
import com.example.androidclient.data.model.MediaItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

private val AutoScrollTrigger: Dp = 40.dp
private const val GRID_LOG_TAG = "MediaGrid"

private enum class DragSelectionAction { Select, Deselect }

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MediaGrid(
    items: LazyPagingItems<MediaItem>,
    onThumbnailClick: (Int) -> Unit,
    modifier: Modifier = Modifier,
    gridContentDescription: String = "Thumbnail Grid",
    emptyContent: (@Composable () -> Unit)? = null,
    isSelecting: Boolean = false,
    selectedIds: Set<Int> = emptySet(),
    onSelectionToggle: ((Int, Boolean) -> Unit)? = null,
    onRequestSelectionMode: ((Int) -> Unit)? = null,
    onSelectionGestureFinish: (() -> Unit)? = null
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

            val selectionEnabled = onSelectionToggle != null
            val gridState = rememberLazyGridState()
            val containerCoordinates = remember { mutableStateOf<LayoutCoordinates?>(null) }
            val itemBounds = remember { mutableStateMapOf<Int, Rect>() }
            val indexToMediaId = remember { mutableStateMapOf<Int, Int>() }
            val selectedIdsState = rememberUpdatedState(selectedIds)
            val density = LocalDensity.current
            val autoScrollTriggerPx = remember(density) { with(density) { AutoScrollTrigger.toPx() } }
            val dragStartSlopPx = remember(density) { with(density) { 10.dp.toPx() } }

            val pointerModifier = if (selectionEnabled) {
                Modifier.pointerInput(selectionEnabled, items.itemCount, isSelecting) {
                    coroutineScope {
                        awaitEachGesture {
                            var selectionModeActive = isSelecting
                            val gestureStartedWithSelection = selectionModeActive
                            var dragAction: DragSelectionAction? = null
                            var initialDragPosition: Offset? = null
                            val processedIndices = mutableSetOf<Int>()
                            var autoScrollJob: Job? = null
                            var autoScrollDirection = 0

                            fun resetDragState() {
                                dragAction = null
                                initialDragPosition = null
                                processedIndices.clear()
                            }

                            fun stopAutoScroll() {
                                autoScrollJob?.cancel()
                                autoScrollJob = null
                                autoScrollDirection = 0
                            }

                            fun ensureAutoScroll(position: Offset) {
                                val container = containerCoordinates.value ?: run {
                                    stopAutoScroll()
                                    return
                                }
                                val height = container.size.height.toFloat()
                                if (height <= 0f) {
                                    stopAutoScroll()
                                    return
                                }
                                val y = position.y
                                val direction = when {
                                    y < autoScrollTriggerPx -> -1
                                    y > height - autoScrollTriggerPx -> 1
                                    else -> 0
                                }
                                if (direction == 0) {
                                    stopAutoScroll()
                                    return
                                }
                                if (direction == autoScrollDirection && autoScrollJob?.isActive == true) return

                                autoScrollJob?.cancel()
                                autoScrollDirection = direction
                                autoScrollJob = launch {
                                    while (isActive) {
                                        val layoutInfo = gridState.layoutInfo
                                        val targetIndex = if (direction < 0) {
                                            (layoutInfo.visibleItemsInfo.firstOrNull()?.index ?: 0) - 1
                                        } else {
                                            (layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1) + 1
                                        }
                                        if (targetIndex in 0 until items.itemCount) {
                                            gridState.scrollToItem(targetIndex)
                                        } else {
                                            stopAutoScroll()
                                            break
                                        }
                                        delay(32)
                                    }
                                }
                            }

                            fun rectIntersectsSelection(target: Rect, selection: Rect): Boolean {
                                return target.left <= selection.right &&
                                    target.right >= selection.left &&
                                    target.top <= selection.bottom &&
                                    target.bottom >= selection.top
                            }

                            fun processOffset(offset: Offset) {
                                val container = containerCoordinates.value ?: return
                                val positionInRoot = container.localToRoot(offset)
                                val dragStart = initialDragPosition ?: positionInRoot.also { initialDragPosition = it }
                                val selectionRect = Rect(
                                    left = min(dragStart.x, positionInRoot.x),
                                    top = min(dragStart.y, positionInRoot.y),
                                    right = max(dragStart.x, positionInRoot.x),
                                    bottom = max(dragStart.y, positionInRoot.y)
                                )

                                val candidateIndices = buildList {
                                    itemBounds.entries.forEach { (index, rect) ->
                                        if (rectIntersectsSelection(rect, selectionRect)) {
                                            add(index)
                                        }
                                    }
                                }.sorted()
                                if (candidateIndices.isEmpty()) return

                                val indexForAction = candidateIndices.firstOrNull { it !in processedIndices }
                                    ?: candidateIndices.first()
                                val mediaIdForAction = indexToMediaId[indexForAction] ?: return
                                val isFirstHit = processedIndices.isEmpty()

                                if (dragAction == null) {
                                    if (!selectionModeActive) {
                                        onRequestSelectionMode?.invoke(mediaIdForAction)
                                        selectionModeActive = true
                                    }
                                    val currentlySelectedRaw = selectedIdsState.value.contains(mediaIdForAction)
                                    val currentlySelected = if (!gestureStartedWithSelection && isFirstHit) {
                                        false
                                    } else {
                                        currentlySelectedRaw
                                    }
                                    dragAction = when {
                                        !selectionModeActive -> DragSelectionAction.Select
                                        currentlySelected -> DragSelectionAction.Deselect
                                        else -> DragSelectionAction.Select
                                    }
                                    Log.d(
                                        GRID_LOG_TAG,
                                        "drag init action=$dragAction index=$indexForAction id=$mediaIdForAction"
                                    )
                                }

                                val targetSelect = dragAction == DragSelectionAction.Select
                                candidateIndices.forEach { index ->
                                    if (!processedIndices.add(index)) return@forEach
                                    val mediaId = indexToMediaId[index] ?: return@forEach
                                    val currentlySelectedRaw = selectedIdsState.value.contains(mediaId)
                                    val currentlySelected = if (!gestureStartedWithSelection && index == indexForAction && isFirstHit) {
                                        false
                                    } else {
                                        currentlySelectedRaw
                                    }
                                    Log.v(
                                        GRID_LOG_TAG,
                                        "drag hit index=$index id=$mediaId target=$targetSelect current=$currentlySelected"
                                    )
                                    if (currentlySelected != targetSelect) {
                                        onSelectionToggle?.invoke(mediaId, targetSelect)
                                    }
                                }
                            }

                            val down = awaitFirstDown(requireUnconsumed = false)
                            val pointerId = down.id

                            var dragStarted = false
                            var startPosition = down.position

                            if (!selectionModeActive) {
                                val longPress = awaitLongPressOrCancellation(pointerId)
                                if (longPress == null) {
                                    resetDragState()
                                    return@awaitEachGesture
                                }
                                dragStarted = true
                                startPosition = longPress.position
                            }

                            resetDragState()
                            if (dragStarted) {
                                processOffset(startPosition)
                                ensureAutoScroll(startPosition)
                            }

                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull { it.id == pointerId } ?: continue
                                if (!change.pressed) {
                                    stopAutoScroll()
                                    resetDragState()
                                    onSelectionGestureFinish?.invoke()
                                    break
                                }

                                if (!dragStarted) {
                                    val dx = change.position.x - startPosition.x
                                    val dy = change.position.y - startPosition.y
                                    val dist2 = dx * dx + dy * dy
                                    if (dist2 >= dragStartSlopPx * dragStartSlopPx) {
                                        dragStarted = true
                                        processOffset(startPosition)
                                        change.consume()
                                    } else {
                                        continue
                                    }
                                }

                                processOffset(change.position)
                                ensureAutoScroll(change.position)
                                change.consume()
                            }
                        }
                    }
                }
            } else {
                Modifier
            }

            Box(
                modifier = modifier
                    .fillMaxSize()
                    .onGloballyPositioned { coordinates -> containerCoordinates.value = coordinates }
                    .then(pointerModifier)
                    .semantics { contentDescription = gridContentDescription }
            ) {
                LazyVerticalGrid(
                    state = gridState,
                    columns = GridCells.Adaptive(minSize = 108.dp),
                    contentPadding = PaddingValues(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(
                        count = items.itemCount,
                        key = items.itemKey { it.id }
                    ) { index ->
                        val item = items[index]
                        if (item != null) {
                            val isItemSelected = selectionEnabled && selectedIds.contains(item.id)
                            DisposableEffect(index, item.id) {
                                indexToMediaId[index] = item.id
                                onDispose {
                                    indexToMediaId.remove(index)
                                    itemBounds.remove(index)
                                }
                            }
                            ThumbnailItem(
                                item = item,
                                isSelected = isItemSelected,
                                isSelecting = selectionEnabled && isSelecting,
                                onClick = {
                                    if (selectionEnabled && isSelecting) {
                                        onSelectionToggle?.invoke(item.id, !isItemSelected)
                                    } else {
                                        onThumbnailClick(index)
                                    }
                                },
                                onLongClick = if (selectionEnabled) {
                                    {
                                        if (!isSelecting) {
                                            onRequestSelectionMode?.invoke(item.id)
                                            onSelectionToggle?.invoke(item.id, true)
                                            Log.d(GRID_LOG_TAG, "enter selection via longClick id=${item.id}")
                                        }
                                    }
                                } else null,
                                modifier = Modifier.onGloballyPositioned { coordinates ->
                                    if (coordinates.isAttached) {
                                        val rect = coordinates.boundsInRoot()
                                        itemBounds[index] = rect
                                        Log.v(GRID_LOG_TAG, "update bounds index=$index id=${item.id} rect=$rect")
                                    } else {
                                        itemBounds.remove(index)
                                    }
                                }
                            )
                        } else {
                            DisposableEffect(index) {
                                indexToMediaId.remove(index)
                                itemBounds.remove(index)
                                onDispose {
                                    indexToMediaId.remove(index)
                                    itemBounds.remove(index)
                                }
                            }
                            Box(modifier = Modifier.aspectRatio(1f))
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
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ThumbnailItem(
    item: MediaItem,
    isSelected: Boolean,
    isSelecting: Boolean,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    Card(
        modifier = modifier
            .aspectRatio(1f)
            .semantics { contentDescription = "Thumbnail Item" }
            .combinedClickable(
                interactionSource = interactionSource,
                onClick = onClick,
                onLongClick = null
            ),
        shape = MaterialTheme.shapes.small
    ) {
        Box {
            ThumbnailImage(
                data = item.thumbnailUrl.takeUnless { it.isNullOrBlank() } ?: item.resourceUrl,
                contentDescription = item.filename,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                targetSize = 108.dp
            )
            SelectionIndicator(isSelected = isSelected, isSelecting = isSelecting)
        }
    }
}

@Composable
private fun BoxScope.SelectionIndicator(isSelected: Boolean, isSelecting: Boolean) {
    if (!isSelected) {
        if (isSelecting) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.1f))
            )
        }
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
    )
    Icon(
        imageVector = Icons.Filled.CheckCircle,
        contentDescription = "已选中",
        tint = MaterialTheme.colorScheme.onPrimary,
        modifier = Modifier
            .padding(8.dp)
            .align(Alignment.TopEnd)
    )
}
