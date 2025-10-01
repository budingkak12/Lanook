package com.example.mytikt_androidclient.data.model

import com.squareup.moshi.Json

/**
 * 点赞/收藏接口使用的请求体。
 */
data class TagOperationRequest(
    @Json(name = "media_id") val mediaId: Long,
    val tag: String
)
