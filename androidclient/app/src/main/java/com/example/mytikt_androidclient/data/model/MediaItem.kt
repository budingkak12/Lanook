package com.example.mytikt_androidclient.data.model

import com.squareup.moshi.Json

/**
 * Kotlin 数据模型，贴合前端的 MediaItem 定义。
 */
data class MediaItem(
    val id: Long,
    @Json(name = "url") val url: String?,
    @Json(name = "resourceUrl") val resourceUrl: String,
    val type: String,
    val filename: String,
    @Json(name = "createdAt") val createdAt: String,
    @Json(name = "thumbnailUrl") val thumbnailUrl: String?,
    val liked: Boolean? = null,
    val favorited: Boolean? = null
) {
    val isVideo: Boolean
        get() = type.equals("video", ignoreCase = true)

    val isImage: Boolean
        get() = type.equals("image", ignoreCase = true)
}
