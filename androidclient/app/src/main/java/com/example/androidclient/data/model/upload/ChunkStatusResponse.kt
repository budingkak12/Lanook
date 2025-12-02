package com.example.androidclient.data.model.upload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ChunkStatusResponse(
    @SerialName("upload_id") val uploadId: String,
    @SerialName("received_chunks") val receivedChunks: List<Int> = emptyList(),
    @SerialName("total_size") val totalSize: Long? = null,
    @SerialName("chunk_size") val chunkSize: Int? = null
)
