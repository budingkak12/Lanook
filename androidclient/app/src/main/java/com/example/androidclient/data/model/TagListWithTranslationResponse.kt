package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class TagWithTranslation(
    val name: String,
    val display_name: String? = null
)

@Serializable
data class TagListWithTranslationResponse(
    val tags: List<TagWithTranslation>
)

