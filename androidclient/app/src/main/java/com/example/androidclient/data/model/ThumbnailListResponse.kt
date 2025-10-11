package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class ThumbnailListResponse(
    val items: List<MediaItem>,
    val offset: Int,
    val hasMore: Boolean
)