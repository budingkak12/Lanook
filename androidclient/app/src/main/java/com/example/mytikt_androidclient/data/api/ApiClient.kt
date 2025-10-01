package com.example.mytikt_androidclient.data.api

import android.content.Context
import com.example.mytikt_androidclient.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

object ApiClient {
    @Volatile
    private var cachedBase: String? = null

    @Volatile
    private var cachedService: ApiService? = null

    private val moshi: Moshi by lazy {
        Moshi.Builder()
            .addLast(KotlinJsonAdapterFactory())
            .build()
    }

    private val httpClient: OkHttpClient by lazy {
        val builder = OkHttpClient.Builder()
        if (BuildConfig.DEBUG) {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            builder.addInterceptor(logging)
        }
        builder.build()
    }

    fun service(context: Context): ApiService {
        val base = ApiConfig.getApiBase(context)
        return synchronized(this) {
            val current = cachedService
            if (current != null && base == cachedBase) return current
            val retrofit = createRetrofit(base)
            val service = retrofit.create(ApiService::class.java)
            cachedBase = base
            cachedService = service
            service
        }
    }

    private fun createRetrofit(base: String): Retrofit {
        return Retrofit.Builder()
            .baseUrl(base)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .client(httpClient)
            .build()
    }
}
