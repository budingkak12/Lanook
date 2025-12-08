package com.example.androidclient.data.model.fs

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class FsRoot(
    val id: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("abs_path") val absPath: String,
    val writable: Boolean,
    val available: Boolean,
    val removable: Boolean,
    @SerialName("total_bytes") val totalBytes: Long? = null,
    @SerialName("free_bytes") val freeBytes: Long? = null,
    val platform: String
)

@Serializable
data class FsItem(
    val name: String,
    @SerialName("is_dir") val isDir: Boolean,
    val size: Long,
    val mtime: Double,
    val ext: String,
    val writable: Boolean,
    @SerialName("thumbnail_url") val thumbnailUrl: String? = null,
    @SerialName("media_meta") val mediaMeta: Map<String, String?>? = null
)

@Serializable
data class FsListResponse(
    val items: List<FsItem>,
    val total: Int,
    val offset: Int,
    val limit: Int
)

@Serializable
data class PathsRequest(
    @SerialName("root_id") val rootId: String,
    val path: String? = null,
    @SerialName("src_path") val srcPath: String? = null,
    @SerialName("dst_path") val dstPath: String? = null,
    @SerialName("paths") val paths: List<String>? = null,
    @SerialName("src_paths") val srcPaths: List<String>? = null,
    @SerialName("dst_dir") val dstDir: String? = null
)

@Serializable
data class SuccessResponse(val success: Boolean = true)
