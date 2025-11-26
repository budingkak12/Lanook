package com.example.androidclient.data.repository

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.random.Random

/**
 * 本地会话种子仓库：
 * - 在进程生命周期内只生成一次 seed；
 * - 冷启动（进程重启）后会生成新的 seed；
 * - 不再依赖后端 /session 接口，与 Web 前端行为保持一致。
 */
class SessionRepository {

    private val mutex = Mutex()
    private var _seed: String? = null

    suspend fun seed(): String = mutex.withLock {
        _seed ?: generateSeed().also { generated ->
            _seed = generated
        }
    }

    private fun generateSeed(): String {
        // 与 Web 端类似：生成一个 13 位左右的正整数作为 session_seed
        val min = 1_000_000_000_000L          // 1e12
        val maxExclusive = 10_000_000_000_000L // 1e13（上界，不包含）
        val value = Random.nextLong(min, maxExclusive)
        return value.toString()
    }
}
