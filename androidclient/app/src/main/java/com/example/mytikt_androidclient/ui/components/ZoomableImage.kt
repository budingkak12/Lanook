package com.example.mytikt_androidclient.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.TransformableState
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntSize
import coil.compose.AsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.flow.collectLatest
import kotlin.math.abs
import kotlin.math.hypot

@Composable
fun ZoomableImage(
    imageUrl: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    minScale: Float = 1f,
    maxScale: Float = 5f,
    onTransformingChanged: (Boolean) -> Unit = {},
) {
    val updatedOnTransform = rememberUpdatedState(onTransformingChanged)
    var containerSize by remember { mutableStateOf(IntSize.Zero) }
    var rawScale by remember { mutableStateOf(1f) }
    var rawOffset by remember { mutableStateOf(Offset.Zero) }
    val transformState: TransformableState = rememberTransformableState { zoomChange, panChange, _ ->
        rawScale = (rawScale * zoomChange).coerceIn(minScale, maxScale)
        val newOffset = (rawOffset + panChange).coerced(containerSize, rawScale)
        rawOffset = newOffset
    }

    LaunchedEffect(transformState) {
        snapshotFlow { transformState.isTransformInProgress }
            .collectLatest { inProgress ->
                if (inProgress) {
                    updatedOnTransform.value(true)
                } else {
                    val offsetMagnitude = rawOffset.magnitude()
                    val zoomed = rawScale > minScale + 0.05f || offsetMagnitude > 16f
                    if (zoomed) {
                        updatedOnTransform.value(true)
                    } else {
                        if (abs(rawScale - minScale) > 0.0001f || offsetMagnitude > 0.5f) {
                            rawScale = minScale
                            rawOffset = Offset.Zero
                        }
                        updatedOnTransform.value(false)
                    }
                }
            }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .clipToBounds()
            .onSizeChanged { containerSize = it }
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = { tapOffset ->
                        val previousScale = rawScale
                        val previousOffset = rawOffset
                        val targetScale = if (rawScale < 1.5f) 2f else 1f
                        rawScale = targetScale.coerceIn(minScale, maxScale)

                        if (rawScale <= minScale + 0.01f) {
                            rawScale = minScale
                            rawOffset = Offset.Zero
                            updatedOnTransform.value(false)
                        } else {
                            val scaleFactor = rawScale / previousScale
                            val focusShift = (tapOffset - containerSize.centerOffset()) * (1f - scaleFactor)
                            rawOffset = (previousOffset * scaleFactor + focusShift).coerced(containerSize, rawScale)
                            updatedOnTransform.value(true)
                        }
                    },
                    onTap = {}
                )
            }
            .graphicsLayer {
                scaleX = rawScale
                scaleY = rawScale
                translationX = rawOffset.x
                translationY = rawOffset.y
            }
            .transformable(transformState),
        content = {
            val context = LocalContext.current
            AsyncImage(
                modifier = Modifier.fillMaxSize(),
                model = ImageRequest.Builder(context)
                    .data(imageUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = contentDescription,
            )
        }
    )
}

private fun IntSize.centerOffset(): Offset =
    Offset(width / 2f, height / 2f)

private fun Offset.magnitude(): Float = hypot(x, y)

private fun Offset.coerced(container: IntSize, scale: Float): Offset {
    if (container == IntSize.Zero || scale <= 1.01f) return Offset.Zero
    val maxX = container.width * (scale - 1f) / 2f
    val maxY = container.height * (scale - 1f) / 2f
    return Offset(x.coerceIn(-maxX, maxX), y.coerceIn(-maxY, maxY))
}

private operator fun Offset.plus(other: Offset): Offset = Offset(x + other.x, y + other.y)

private operator fun Offset.times(factor: Float): Offset = Offset(x * factor, y * factor)
