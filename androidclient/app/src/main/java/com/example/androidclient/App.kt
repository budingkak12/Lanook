package com.example.androidclient

import android.app.Application
import com.example.androidclient.di.NetworkModule
import com.example.androidclient.di.ServerResolver
import kotlinx.coroutines.runBlocking

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // 同步探测可用服务器，尽量在首屏网络请求前完成
        runBlocking {
            val base = ServerResolver.resolve()
            NetworkModule.updateBaseUrl(base)
        }
    }
}

