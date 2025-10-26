package com.example.androidclient.data.repository

import com.example.androidclient.data.model.BulkDeleteResult
import com.example.androidclient.data.remote.ApiService

class MediaRepository(
    private val api: ApiService
) {

    suspend fun deleteMedia(ids: Collection<Int>, deleteFile: Boolean = true): BulkDeleteResult {
        if (ids.isEmpty()) return BulkDeleteResult(emptyList(), emptyList())

        val successes = mutableListOf<Int>()
        val failures = mutableListOf<Pair<Int, Throwable>>()

        ids.forEach { id ->
            runCatching {
                api.deleteMedia(mediaId = id, deleteFile = deleteFile)
            }.onSuccess {
                successes += id
            }.onFailure { throwable ->
                failures += id to throwable
            }
        }

        return BulkDeleteResult(successes, failures)
    }
}
