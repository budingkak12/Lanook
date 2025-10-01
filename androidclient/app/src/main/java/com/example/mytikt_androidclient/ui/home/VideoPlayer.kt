package com.example.mytikt_androidclient.ui.home

import android.view.ViewGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import kotlin.math.abs

@Composable
fun VideoPlayer(
    url: String,
    isActive: Boolean,
    playbackPositionMs: Long,
    onPlaybackPositionChange: (Long) -> Unit,
    onPlaybackEnded: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val mediaItem = remember(url) { MediaItem.fromUri(url) }
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = false
            repeatMode = Player.REPEAT_MODE_OFF
            setMediaItem(mediaItem)
            prepare()
        }
    }

    DisposableEffect(exoPlayer) {
        onDispose {
            onPlaybackPositionChange(exoPlayer.currentPosition)
            exoPlayer.release()
        }
    }

    LaunchedEffect(mediaItem) {
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
    }

    LaunchedEffect(isActive, playbackPositionMs) {
        if (isActive) {
            if (playbackPositionMs > 0 && abs(exoPlayer.currentPosition - playbackPositionMs) > 500) {
                exoPlayer.seekTo(playbackPositionMs)
            }
            exoPlayer.playWhenReady = true
            exoPlayer.play()
        } else {
            onPlaybackPositionChange(exoPlayer.currentPosition)
            exoPlayer.pause()
        }
    }

    LaunchedEffect(exoPlayer, isActive) {
        if (!isActive) return@LaunchedEffect
        while (true) {
            onPlaybackPositionChange(exoPlayer.currentPosition)
            delay(500)
        }
    }

    DisposableEffect(exoPlayer, isActive) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    onPlaybackEnded()
                    onPlaybackPositionChange(0)
                    exoPlayer.seekTo(0)
                    exoPlayer.pause()
                }
            }
        }
        if (isActive) {
            exoPlayer.addListener(listener)
        }
        onDispose {
            exoPlayer.removeListener(listener)
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                useController = true
                player = exoPlayer
            }
        },
        update = { view ->
            view.player = exoPlayer
        }
    )
}
