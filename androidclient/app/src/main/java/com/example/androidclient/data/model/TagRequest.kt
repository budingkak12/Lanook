package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class TagRequest(
    val media_id: Int,
    val tag: String
)
