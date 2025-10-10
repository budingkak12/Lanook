package com.example.mytikt_androidclient.ui.components

import android.graphics.Color as AndroidColor
import android.view.ViewGroup
import android.widget.ImageView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import coil.load
import com.github.chrisbanes.photoview.PhotoView

/**
 * PhotoView-based image viewer providing pinch-to-zoom and double-tap gestures.
 */
@Composable
fun PhotoViewer(
    imageUrl: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    onTransformingChanged: (Boolean) -> Unit = {},
) {
    val currentOnTransform = rememberUpdatedState(onTransformingChanged)
    var lastNotifiedTransform by remember { mutableStateOf(false) }
    val transformThreshold = 0.05f

    AndroidView(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
        factory = { ctx ->
            PhotoView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                setBackgroundColor(AndroidColor.BLACK)
                scaleType = ImageView.ScaleType.FIT_CENTER
                minimumScale = 1f
                mediumScale = 2f
                maximumScale = 5f
                setZoomTransitionDuration(200)
                setAllowParentInterceptOnEdge(true)
            }
        },
        update = { photoView ->
            val notifyTransform: () -> Unit = {
                val active = photoView.scale > photoView.minimumScale + transformThreshold
                if (active != lastNotifiedTransform) {
                    lastNotifiedTransform = active
                    currentOnTransform.value(active)
                }
            }

            photoView.setOnScaleChangeListener { _, _, _ -> notifyTransform() }
            photoView.setOnMatrixChangeListener { notifyTransform() }
            photoView.contentDescription = contentDescription

            if (photoView.tag != imageUrl) {
                photoView.tag = imageUrl
                lastNotifiedTransform = false
                currentOnTransform.value(false)
                photoView.setScale(photoView.minimumScale, false)
                photoView.load(imageUrl) {
                    crossfade(true)
                    listener(
                        onSuccess = { _, _ -> notifyTransform() },
                        onError = { _, _ ->
                            lastNotifiedTransform = false
                            currentOnTransform.value(false)
                        },
                    )
                }
            } else {
                notifyTransform()
            }
        },
    )
}
