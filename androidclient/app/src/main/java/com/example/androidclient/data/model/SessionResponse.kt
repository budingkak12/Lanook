package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class SessionResponse(
    val session_seed: String
)