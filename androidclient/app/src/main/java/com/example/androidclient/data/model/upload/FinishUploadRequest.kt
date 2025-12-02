package com.example.androidclient.data.model.upload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class FinishUploadRequest(
    @SerialName("upload_id") val uploadId: String,
    @SerialName("total_chunks") val totalChunks: Int,
    @SerialName("checksum") val checksum: String? = null,
    @SerialName("skip_scan") val skipScan: Boolean = false
)
