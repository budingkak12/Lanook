package com.example.androidclient.data.model.upload

import kotlinx.serialization.Serializable

@Serializable
data class FinishUploadResponse(
    val path: String
)
