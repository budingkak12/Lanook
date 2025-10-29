package com.example.androidclient.di

import com.example.androidclient.data.remote.ApiService
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object NetworkModule {

    @Volatile
    private var baseUrl: String? = null

    private val json = Json { ignoreUnknownKeys = true }

    private fun newOkHttp(): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    // Debug 模式打印 BODY，便于定位返回体解析问题；Release 降级为 BASIC
                    val isDebug = try {
                        val cls = Class.forName("com.example.androidclient.BuildConfig")
                        val f = cls.getField("DEBUG")
                        f.getBoolean(null)
                    } catch (_: Throwable) { false }
                    level = if (isDebug) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.BASIC
                }
            )
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
    private var apiInstance: ApiService? = null

    val api: ApiService
        get() = apiInstance ?: throw IllegalStateException("服务器地址尚未初始化，请先在连接页完成配置")

    @Synchronized
    fun updateBaseUrl(newBaseUrl: String) {
        val normalized = if (newBaseUrl.endsWith('/')) newBaseUrl.dropLast(1) else newBaseUrl
        if (baseUrl != null && normalized == baseUrl) return
        baseUrl = normalized
        // 复用同一个 OkHttpClient，重新构建 Retrofit 与 ApiService
        val newApi = buildRetrofit(normalized).create(ApiService::class.java)
        apiInstance = newApi
    }

    fun currentBaseUrl(): String? = baseUrl

    // 暴露 OkHttp 供图片加载器等共用连接池/缓存，避免重复初始化带来的抖动
    fun okHttpClient(): OkHttpClient = okHttp
}
