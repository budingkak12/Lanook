package com.example.androidclient.data.repository

import com.example.androidclient.data.remote.ApiService
import com.example.androidclient.data.model.SessionResponse
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
class SessionRepository(
    private val api: ApiService
) {
    private val mutex = Mutex()
    private var _seed: String? = null

    suspend fun seed(): String = mutex.withLock {
        _seed ?: kotlin.run {
            val resp = api.getSession() // 我们稍后给 ApiService 增加这个方法
            _seed = resp.session_seed
            resp.session_seed
        }
    }
}