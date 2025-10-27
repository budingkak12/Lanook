package com.example.androidclient.data.model

import kotlinx.serialization.Serializable

@Serializable
data class DeleteBatchRequest(
    val ids: List<Int>,
    val delete_file: Boolean = true
)

@Serializable
data class DeleteBatchResponse(
    val deleted: List<Int>,
    val failed: List<DeleteFailedItem> = emptyList()
)

@Serializable
data class DeleteFailedItem(
    val id: Int,
    val reason: String
)

