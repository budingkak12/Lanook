package com.example.androidclient.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.size.Precision
import coil3.size.Size
import kotlin.math.roundToInt

/**
 * 小尺寸媒体缩略图的统一加载入口，集中设置解码尺寸与缓存策略。
 * 通过限制解码尺寸来降低 GPU/CPU 压力，减少滑动掉帧。
 */
@Composable
fun ThumbnailImage(
    data: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    targetSize: Dp = 140.dp,
    contentScale: ContentScale = ContentScale.Crop
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val px = remember(targetSize, density) {
        // 以方形为主，最小 64px 防止过小导致频繁重新解码
        with(density) { targetSize.toPx().roundToInt() }.coerceAtLeast(64)
    }
    val widthPx = px
    val heightPx = px

    val request = remember(data, widthPx, heightPx, context) {
        val source = data?.ifBlank { null }
        ImageRequest.Builder(context)
            .data(source)
            .size(Size(widthPx, heightPx))
            // 放宽精度，避免为像素级匹配而做额外解码成本
            .precision(Precision.INEXACT)
            .build()
    }

    val placeholder: ColorPainter = remember { ColorPainter(Color(0x11000000)) }

    AsyncImage(
        model = request,
        contentDescription = contentDescription,
        placeholder = placeholder,
        error = placeholder,
        modifier = modifier,
        contentScale = contentScale
    )
}
