package com.example.androidclient.data.model.upload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InitUploadResponse(
    @SerialName("upload_id") val uploadId: String,
    @SerialName("existed") val existed: Boolean = false,
    @SerialName("received_chunks") val receivedChunks: List<Int> = emptyList(),
    @SerialName("chunk_size") val chunkSize: Int
)
