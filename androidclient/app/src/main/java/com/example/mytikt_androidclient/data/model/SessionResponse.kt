package com.example.mytikt_androidclient.data.model

import com.squareup.moshi.Json

/**
 * /session 接口的响应。
 */
data class SessionResponse(
    @Json(name = "session_seed") val sessionSeed: String
)
