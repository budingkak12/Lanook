package com.example.androidclient.di

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object ServerResolver {

    private fun probeClient(): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(1500, TimeUnit.MILLISECONDS)
            .readTimeout(1500, TimeUnit.MILLISECONDS)
            .writeTimeout(1500, TimeUnit.MILLISECONDS)
            .build()

    /**
     * 依次探测候选地址的 `/health`，返回首个可用 baseUrl。
     * 全部失败则回退到候选列表第一个。
     */
    suspend fun resolve(): String = withContext(Dispatchers.IO) {
        val client = probeClient()
        outer@ for (base in NetworkModule.candidateBaseUrls) {
            val url = if (base.endsWith('/')) base + "health" else "$base/health"
            repeat(2) {
                try {
                    val req = Request.Builder().url(url).get().build()
                    client.newCall(req).execute().use { resp ->
                        if (resp.isSuccessful) {
                            return@withContext base
                        }
                    }
                } catch (_: Exception) {
                    // retry with small delay then next
                    try { Thread.sleep(200) } catch (_: InterruptedException) {}
                }
            }
        }

        // 全部失败：回退到第一个，同时做一次“非致命确认”以便在后端日志中可见
        val fallback = NetworkModule.candidateBaseUrls.first()
        try {
            val confirm = if (fallback.endsWith('/')) fallback + "health" else "$fallback/health"
            val req = Request.Builder().url(confirm).get().build()
            client.newCall(req).execute().use { _ -> }
        } catch (_: Exception) {
            // ignore
        }
        return@withContext fallback
    }
}
