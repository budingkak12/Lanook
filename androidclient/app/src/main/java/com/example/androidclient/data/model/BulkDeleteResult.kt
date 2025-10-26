package com.example.androidclient.data.model

data class BulkDeleteResult(
    val successIds: List<Int>,
    val failed: List<Pair<Int, Throwable>>
) {
    val isSuccessful: Boolean get() = failed.isEmpty()
    val failureCount: Int get() = failed.size
    val successCount: Int get() = successIds.size
}
