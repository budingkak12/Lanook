package com.example.androidclient.data.model.upload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UploadChunkMeta(
    @SerialName("upload_id") val uploadId: String,
    @SerialName("index") val index: Int,
    @SerialName("checksum") val checksum: String? = null
)
