package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class TagListResponse(
    val tags: List<String>
)

