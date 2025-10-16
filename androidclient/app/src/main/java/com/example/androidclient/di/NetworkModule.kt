package com.example.androidclient.di

import com.example.androidclient.data.remote.ApiService
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object NetworkModule {

    // 备选服务器地址（优先公司网，其次家庭网）
    internal val candidateBaseUrls: List<String> = listOf(
        "http://10.209.30.60:8000",
        "http://192.168.31.58:8000",
    )

    @Volatile
    private var baseUrl: String = candidateBaseUrls.first()

    private val json = Json { ignoreUnknownKeys = true }

    private fun newOkHttp(): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY })
            .build()

    @Volatile
    private var okHttp: OkHttpClient = newOkHttp()

    private fun buildRetrofit(url: String): Retrofit =
        Retrofit.Builder()
            .baseUrl(if (url.endsWith('/')) url else "$url/")
            .client(okHttp)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Volatile
    private var retrofit: Retrofit = buildRetrofit(baseUrl)

    @Volatile
    var api: ApiService = retrofit.create(ApiService::class.java)
        private set

    @Synchronized
    fun updateBaseUrl(newBaseUrl: String) {
        val normalized = if (newBaseUrl.endsWith('/')) newBaseUrl.dropLast(1) else newBaseUrl
        if (normalized == baseUrl) return
        baseUrl = normalized
        // 复用同一个 OkHttpClient，重新构建 Retrofit 与 ApiService
        retrofit = buildRetrofit(baseUrl)
        api = retrofit.create(ApiService::class.java)
    }

    fun currentBaseUrl(): String = baseUrl
}
