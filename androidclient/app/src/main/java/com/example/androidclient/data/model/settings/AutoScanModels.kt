package com.example.androidclient.data.model.settings

import kotlinx.serialization.Serializable

@Serializable
data class AutoScanStatusResponse(
    val enabled: Boolean,
    val active: Boolean,
    val message: String? = null
)

@Serializable
data class AutoScanUpdateRequest(
    val enabled: Boolean
)
