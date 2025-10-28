package com.example.androidclient.data.model.setup

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DirectoryEntry(
    val path: String,
    val name: String,
    val readable: Boolean,
    val writable: Boolean,
    @SerialName("is_root")
    val isRoot: Boolean,
    @SerialName("is_symlink")
    val isSymlink: Boolean = false
)

@Serializable
data class DirectoryListResponse(
    @SerialName("current_path")
    val currentPath: String,
    @SerialName("parent_path")
    val parentPath: String? = null,
    val entries: List<DirectoryEntry>
)

@Serializable
enum class InitializationState {
    @SerialName("idle")
    IDLE,

    @SerialName("running")
    RUNNING,

    @SerialName("completed")
    COMPLETED,

    @SerialName("failed")
    FAILED
}

@Serializable
data class MediaRootRequest(
    val path: String
)

@Serializable
data class InitializationStatusResponse(
    val state: InitializationState,
    val message: String? = null,
    @SerialName("media_root_path")
    val mediaRootPath: String? = null
)
