package com.example.mytikt_androidclient.di

import android.content.Context
import com.example.mytikt_androidclient.data.api.ApiClient
import com.example.mytikt_androidclient.data.api.ApiConfig
import com.example.mytikt_androidclient.data.repository.FeedRepository

object ServiceLocator {
    @Volatile
    private var feedRepository: FeedRepository? = null

    fun provideFeedRepository(context: Context): FeedRepository {
        val appContext = context.applicationContext
        return feedRepository ?: synchronized(this) {
            val service = ApiClient.service(appContext)
            val base = ApiConfig.getApiBase(appContext)
            feedRepository ?: FeedRepository(service, base).also {
                feedRepository = it
            }
        }
    }

    fun reset() {
        feedRepository = null
    }
}
