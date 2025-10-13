package com.example.androidclient.ui

import android.util.Log
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

private const val VIDEO_TAG = "VideoPlayer"

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@Composable
fun VideoPlayer(
    modifier: Modifier = Modifier,
    url: String,
    onDoubleTap: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val onDoubleTapState = rememberUpdatedState(onDoubleTap)

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(
        AndroidView(modifier = modifier, factory = { viewContext ->
            PlayerView(viewContext).apply {
                player = exoPlayer
                setShowNextButton(false)
                setShowPreviousButton(false)
                controllerAutoShow = false

                if (onDoubleTapState.value != null) {
                    var consumedDoubleTap = false
                    val gestureDetector = GestureDetector(viewContext, object : GestureDetector.SimpleOnGestureListener() {
                        override fun onDown(e: MotionEvent): Boolean {
                            consumedDoubleTap = false
                            return true
                        }

                        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                            Log.d(VIDEO_TAG, "onSingleTapConfirmed -> toggle controller")
                            if (isControllerFullyVisible) {
                                hideController()
                            } else {
                                showController()
                            }
                            return true
                        }

                        override fun onDoubleTap(e: MotionEvent): Boolean {
                            Log.d(VIDEO_TAG, "onDoubleTap detected at (${e.x}, ${e.y})")
                            consumedDoubleTap = true
                            hideController()
                            onDoubleTapState.value?.invoke()
                            return true
                        }

                        override fun onDoubleTapEvent(e: MotionEvent): Boolean {
                            return consumedDoubleTap
                        }
                    })
                    setOnTouchListener { _, event ->
                        val handled = gestureDetector.onTouchEvent(event)
                        if (consumedDoubleTap) {
                            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
                                Log.d(VIDEO_TAG, "consumed double tap sequence, suppressing controller toggle")
                                consumedDoubleTap = false
                            }
                            true
                        } else {
                            handled
                        }
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
