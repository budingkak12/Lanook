package com.example.mytikt_androidclient.data.model

import com.squareup.moshi.Json

/**
 * 后端分页接口响应。
 */
data class MediaListResponse(
    val items: List<MediaItem>,
    val offset: Int,
    @Json(name = "hasMore") val hasMore: Boolean
)
