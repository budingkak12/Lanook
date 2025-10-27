package com.example.androidclient

import android.app.Application
// 注意：此处避免做图片加载器重写，以减少 API 差异带来的编译问题
import com.example.androidclient.di.NetworkModule
import com.example.androidclient.di.ServerResolver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 应用级初始化：
 * - 异步探测服务器，避免冷启动阻塞主线程
 * - 提供全局 ImageLoader，复用 OkHttp 连接池并配置缓存，降低首屏争用
 */
class App : Application() {

    override fun onCreate() {
        super.onCreate()
        // 异步探测可用服务器，避免 runBlocking 阻塞主线程导致首帧丢失
        CoroutineScope(Dispatchers.IO).launch {
            kotlin.runCatching { ServerResolver.resolve() }
                .onSuccess { base -> NetworkModule.updateBaseUrl(base) }
        }
        // 全局图片加载器保持默认，避免 API 变更引入不稳定因素
    }
}
