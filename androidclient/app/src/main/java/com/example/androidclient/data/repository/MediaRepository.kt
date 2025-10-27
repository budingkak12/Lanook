package com.example.androidclient.data.repository

import com.example.androidclient.data.model.BulkDeleteResult
import com.example.androidclient.data.model.DeleteBatchRequest
import com.example.androidclient.data.remote.ApiService
import retrofit2.HttpException

class MediaRepository(
    private val api: ApiService
) {

    suspend fun deleteMedia(ids: Collection<Int>, deleteFile: Boolean = true): BulkDeleteResult {
        if (ids.isEmpty()) return BulkDeleteResult(emptyList(), emptyList())
        return runCatching {
            val resp = api.batchDelete(DeleteBatchRequest(ids = ids.toList(), delete_file = deleteFile))
            val failedPairs = resp.failed.map { it.id to IllegalStateException(it.reason) }
            BulkDeleteResult(successIds = resp.deleted, failed = failedPairs)
        }.getOrElse { batchErr ->
            // 兼容性回退：逐个调用 DELETE /media/{id}；404 视为成功（幂等）。
            val successes = mutableListOf<Int>()
            val failures = mutableListOf<Pair<Int, Throwable>>()
            ids.forEach { id ->
                try {
                    api.deleteMedia(mediaId = id, deleteFile = deleteFile)
                    successes += id
                } catch (e: Throwable) {
                    if (e is HttpException && e.code() == 404) {
                        // 已被他端删除，按成功处理
                        successes += id
                    } else {
                        failures += id to (e ?: batchErr)
                    }
                }
            }
            BulkDeleteResult(successIds = successes, failed = failures)
        }
    }
}
