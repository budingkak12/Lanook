package com.example.androidclient.ui

import android.view.GestureDetector
import android.view.MotionEvent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun VideoPlayer(
    modifier: Modifier = Modifier,
    url: String,
    onDoubleTap: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
    }
    val onDoubleTapState = rememberUpdatedState(onDoubleTap)

    DisposableEffect(
        AndroidView(modifier = modifier, factory = {
            PlayerView(it).apply {
                player = exoPlayer
                setShowNextButton(false)
                setShowPreviousButton(false)
                if (onDoubleTapState.value != null) {
                    val gestureDetector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
                        override fun onDoubleTap(e: MotionEvent): Boolean {
                            onDoubleTapState.value?.invoke()
                            return true
                        }
                    })
                    setOnTouchListener { _, event ->
                        gestureDetector.onTouchEvent(event)
                        false
                    }
                }
            }
        })
    ) {
        onDispose {
            exoPlayer.release()
        }
    }
}
