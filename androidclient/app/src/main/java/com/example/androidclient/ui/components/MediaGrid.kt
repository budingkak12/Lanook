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
import androidx.compose.runtime.LaunchedEffect
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
// 统一控制网格调试日志，默认关闭以避免主线程日志导致掉帧
private const val GRID_DEBUG_LOG = false

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
                            var anchorIndex: Int? = null
                            var lastRange: IntRange? = null
                            val originSelectedIds = selectedIdsState.value.toSet()
                            val localSelection = mutableMapOf<Int, Boolean>()
                            var autoScrollJob: Job? = null
                            var autoScrollDirection = 0
                            var lastPointerPosition: Offset? = null
                            var onAutoScrollTick: ((Offset) -> Unit)? = null

                            fun hitIndexAt(offset: Offset): Int? {
                                val container = containerCoordinates.value ?: return null
                                val positionInRoot = container.localToRoot(offset)
                                return itemBounds.entries.firstOrNull { (_, rect) -> rect.contains(positionInRoot) }?.key
                            }

                            fun applyRangeTo(currentIndex: Int) {
                                val anchor = anchorIndex ?: return
                                val newRange = if (currentIndex >= anchor) anchor..currentIndex else currentIndex..anchor
                                val prevRange = lastRange
                                val minIdx = min(newRange.first, prevRange?.first ?: newRange.first)
                                val maxIdx = max(newRange.last, prevRange?.last ?: newRange.last)
                                val targetSelect = dragAction == DragSelectionAction.Select

                                for (i in minIdx..maxIdx) {
                                    val id = indexToMediaId[i] ?: continue
                                    val baseline = localSelection[id] ?: originSelectedIds.contains(id)
                                    val shouldBeSelected = if (i in newRange) targetSelect else originSelectedIds.contains(id)
                                    if (baseline != shouldBeSelected) {
                                        onSelectionToggle?.invoke(id, shouldBeSelected)
                                        localSelection[id] = shouldBeSelected
                                    }
                                }
                                lastRange = newRange
                            }

                            

                            fun resetDragState() {
                                dragAction = null
                                anchorIndex = null
                                lastRange = null
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
                                    // 平滑滚动参数
                                    val minSpeed = 300f    // px/s
                                    val maxSpeed = 2200f   // px/s
                                    val frameMs = 16L
                                    while (isActive) {
                                        val yNow = lastPointerPosition?.y ?: position.y
                                        val ratio = if (direction < 0) {
                                            ((autoScrollTriggerPx - yNow).coerceAtLeast(0f) / autoScrollTriggerPx)
                                        } else {
                                            ((yNow - (height - autoScrollTriggerPx)).coerceAtLeast(0f) / autoScrollTriggerPx)
                                        }.coerceIn(0f, 1f)
                                        val speed = minSpeed + (maxSpeed - minSpeed) * ratio * ratio
                                        val stepPx = speed * (frameMs / 1000f) * direction

                                        // 使用按像素滚动，失败则尝试到相邻项
                                        var scrolled = false
                                        try {
                                            gridState.scroll { scrollBy(stepPx) }
                                            scrolled = true
                                        } catch (_: Throwable) {}

                                        if (!scrolled) {
                                            val layoutInfo = gridState.layoutInfo
                                            val fallbackIndex = if (direction < 0) {
                                                (layoutInfo.visibleItemsInfo.firstOrNull()?.index ?: 0) - 1
                                            } else {
                                                (layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1) + 1
                                            }
                                            if (fallbackIndex in 0 until items.itemCount) {
                                                gridState.animateScrollToItem(fallbackIndex)
                                            } else {
                                                stopAutoScroll()
                                                break
                                            }
                                        }

                                        // 等待一帧，确保 bounds 更新
                                        try { androidx.compose.runtime.withFrameNanos { } } catch (_: Throwable) {}
                                        // 优先使用边缘可见项索引扩展范围，保证新出现项被纳入
                                        val edgeIndex = try {
                                            val vis = gridState.layoutInfo.visibleItemsInfo
                                            if (direction > 0) vis.lastOrNull()?.index else vis.firstOrNull()?.index
                                        } catch (_: Throwable) { null }
                                        if (edgeIndex != null && anchorIndex != null && dragAction != null) {
                                            applyRangeTo(edgeIndex)
                                        } else {
                                            lastPointerPosition?.let { lp -> onAutoScrollTick?.invoke(lp) }
                                        }
                                        delay(frameMs)
                                    }
                                }
                            }

                            

                            fun processOffset(offset: Offset) {
                                val hit = hitIndexAt(offset) ?: return
                                if (dragAction == null) {
                                    anchorIndex = hit
                                    val anchorId = indexToMediaId[hit] ?: return
                                    if (!selectionModeActive) {
                                        onRequestSelectionMode?.invoke(anchorId)
                                        selectionModeActive = true
                                    }
                                    val anchorSelected = if (!gestureStartedWithSelection) false else originSelectedIds.contains(anchorId)
                                    dragAction = if (anchorSelected) DragSelectionAction.Deselect else DragSelectionAction.Select
                                    Log.d(GRID_LOG_TAG, "drag init action=$dragAction index=$hit id=$anchorId")
                                }
                                applyRangeTo(hit)
                            }
                            onAutoScrollTick = { offset -> processOffset(offset) }

                            val down = awaitFirstDown(requireUnconsumed = false)
                            val pointerId = down.id

                            var dragStarted = false
                            var startPosition = down.position

                            // 在选择模式下，先设置一个短按停留阈值，避免与滚动手势冲突
                            var heldEnough = !selectionModeActive
                            var holdJob: Job? = null

                            if (selectionModeActive) {
                                holdJob = launch {
                                    delay(120)
                                    heldEnough = true
                                }
                            }

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
                                lastPointerPosition = startPosition
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
                                    val slop2 = dragStartSlopPx * dragStartSlopPx

                                    if (selectionModeActive && !heldEnough) {
                                        if (dist2 < slop2) {
                                            // 小幅移动，继续等待
                                            continue
                                        }
                                        // 判断方向：明显纵向 -> 交给滚动；否则立即进入拖选
                                        val absDx = kotlin.math.abs(dx)
                                        val absDy = kotlin.math.abs(dy)
                                        val verticalDominant = absDy > absDx * 1.5f
                                        if (verticalDominant) {
                                            stopAutoScroll()
                                            resetDragState()
                                            holdJob?.cancel()
                                            return@awaitEachGesture
                                        }
                                        // 侧向/斜向：立即开始拖选
                                    } else if (dist2 < slop2 && selectionModeActive) {
                                        // 已达到停留阈值但还未明显移动：继续等下一帧
                                        continue
                                    }

                                    // 满足开始条件：启动拖选
                                    dragStarted = true
                                    lastPointerPosition = startPosition
                                    processOffset(startPosition)
                                    ensureAutoScroll(startPosition)
                                    change.consume()
                                }

                                lastPointerPosition = change.position
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
                        key = items.itemKey { it.id },
                        contentType = { _ -> "thumb" }
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
                                    if (GRID_DEBUG_LOG) {
                                        Log.d(GRID_LOG_TAG, "enter selection via longClick id=${item.id}")
                                    }
                                        }
                                    }
                                } else null,
                                modifier = Modifier.onGloballyPositioned { coordinates ->
                                    if (coordinates.isAttached) {
                                        val rect = coordinates.boundsInRoot()
                                        // 仅在矩形发生变化时更新，减少 map 写入与无意义日志
                                        val prev = itemBounds[index]
                                        if (prev != rect) {
                                            itemBounds[index] = rect
                                            if (GRID_DEBUG_LOG) {
                                                Log.v(GRID_LOG_TAG, "update bounds index=$index id=${item.id} rect=$rect")
                                            }
                                        }
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

                // 不在网格内部触发 refresh；由上游过滤已删除项后自然补位
            }
        }
    }

}

// RefreshCommand 已移除：由 ViewModel 层过滤 PagingData 实现补位

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
                indication = null,
                onClick = onClick,
                onLongClick = onLongClick
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
