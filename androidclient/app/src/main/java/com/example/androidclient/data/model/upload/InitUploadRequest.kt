package com.example.androidclient.data.model.upload

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InitUploadRequest(
    @SerialName("filename") val filename: String,
    @SerialName("total_size") val totalSize: Long,
    @SerialName("chunk_size") val chunkSize: Int,
    @SerialName("checksum") val checksum: String? = null,
    @SerialName("device_id") val deviceId: String? = null,
    @SerialName("mime_type") val mimeType: String? = null,
    @SerialName("relative_path") val relativePath: String? = null,
    @SerialName("modified_at") val modifiedAt: Long? = null
)
