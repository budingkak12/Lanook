package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class MediaItem(
    val id: Int,
    val url: String,
    val resourceUrl: String,
    val type: String, // "image" | "video"
    val filename: String,
    val createdAt: String,
    val thumbnailUrl: String?,
    val liked: Boolean? = null,
    val favorited: Boolean? = null
)
