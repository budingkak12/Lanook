package com.example.androidclient.data.repository

import com.example.androidclient.data.model.settings.AutoScanStatusResponse
import com.example.androidclient.data.model.settings.AutoScanUpdateRequest
import com.example.androidclient.data.remote.ApiService
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import retrofit2.HttpException

class SettingsRepository(
    private val api: ApiService
) {

    suspend fun fetchAutoScanStatus(): AutoScanStatusResponse {
        return api.getAutoScanStatus()
    }

    suspend fun updateAutoScan(enabled: Boolean): AutoScanStatusResponse {
        return try {
            api.updateAutoScan(AutoScanUpdateRequest(enabled))
        } catch (exception: HttpException) {
            if (exception.code() == 409) {
                val fallback = "自动扫描暂不可用，请确认服务器媒体目录配置。"
                val payload = exception.response()?.errorBody()?.string()
                val message = payload?.let { body ->
                    runCatching { json.decodeFromString(ErrorPayload.serializer(), body).detail }
                        .getOrNull()
                }?.takeUnless { it.isNullOrBlank() } ?: fallback
                throw AutoScanConflictException(message)
            }
            throw exception
        }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
    }
}

class AutoScanConflictException(message: String) : Exception(message)

@Serializable
private data class ErrorPayload(val detail: String? = null)
