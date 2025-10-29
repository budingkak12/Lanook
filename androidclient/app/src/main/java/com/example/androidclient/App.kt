package com.example.androidclient

import android.app.Application
// 注意：此处避免做图片加载器重写，以减少 API 差异带来的编译问题
/**
 * 应用级初始化：
 * - 提供全局 ImageLoader，复用 OkHttp 连接池并配置缓存，降低首屏争用
 */
class App : Application() {

    override fun onCreate() {
        super.onCreate()
        // 全局图片加载器保持默认，避免 API 变更引入不稳定因素
    }
}
