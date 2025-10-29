package com.example.androidclient.data.model.tasks

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ScanTaskState {
    @SerialName("no_media_root")
    NO_MEDIA_ROOT,

    @SerialName("ready")
    READY,

    @SerialName("error")
    ERROR
}

@Serializable
data class ScanTaskStatusResponse(
    val state: ScanTaskState,
    @SerialName("media_root_path")
    val mediaRootPath: String? = null,
    @SerialName("scanned_count")
    val scannedCount: Int,
    @SerialName("total_discovered")
    val totalDiscovered: Int? = null,
    @SerialName("remaining_count")
    val remainingCount: Int? = null,
    @SerialName("preview_batch_size")
    val previewBatchSize: Int,
    val message: String? = null,
    @SerialName("generated_at")
    val generatedAt: String
)
