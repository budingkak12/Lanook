package com.example.androidclient.data.connection

import android.content.Context
import android.net.Uri
import com.example.androidclient.di.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class ConnectionRepository(context: Context) {

    private val appContext = context.applicationContext

    private val probeClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(2, TimeUnit.SECONDS)
        .readTimeout(2, TimeUnit.SECONDS)
        .writeTimeout(2, TimeUnit.SECONDS)
        .build()

    fun storedBaseUrl(): Flow<String?> =
        ConnectionPreferences.baseUrlFlow(appContext).distinctUntilChanged()

    suspend fun saveBaseUrl(baseUrl: String) {
        ConnectionPreferences.writeBaseUrl(appContext, baseUrl)
    }

    fun canonicalize(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val prepared = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "http://$trimmed"
        }
        return runCatching {
            val uri = Uri.parse(prepared)
            val scheme = (uri.scheme ?: "http").lowercase()
            val host = uri.host ?: return@runCatching null
            val port = uri.port.takeIf { it != -1 }
            val authority = when {
                port == null -> host
                (scheme == "http" && port == 80) || (scheme == "https" && port == 443) -> host
                else -> "$host:$port"
            }
            "$scheme://$authority"
        }.getOrNull()
    }

    suspend fun verify(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        val normalized = canonicalize(baseUrl) ?: return@withContext false
        val url = "$normalized/health"
        val req = Request.Builder().url(url).get().build()
        runCatching {
            probeClient.newCall(req).execute().use { resp -> resp.isSuccessful }
        }.getOrDefault(false)
    }

    suspend fun verifyAndPersist(raw: String): Result<String> {
        val normalized = canonicalize(raw) ?: return Result.failure(IllegalArgumentException("无法识别的地址"))
        val ok = verify(normalized)
        if (!ok) {
            return Result.failure(IllegalStateException("服务器未响应 /health"))
        }
        NetworkModule.updateBaseUrl(normalized)
        saveBaseUrl(normalized)
        return Result.success(normalized)
    }

    /**
     * 依次尝试候选地址，返回第一个可用的 canonical URL，不落库。
     */
    suspend fun findReachable(candidates: List<String>): String? = withContext(Dispatchers.IO) {
        for (raw in candidates) {
            val canonical = canonicalize(raw) ?: continue
            if (verify(canonical)) return@withContext canonical
        }
        null
    }
}
