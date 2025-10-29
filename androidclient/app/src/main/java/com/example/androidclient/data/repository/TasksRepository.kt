package com.example.androidclient.data.repository

import com.example.androidclient.data.model.tasks.ScanTaskStatusResponse
import com.example.androidclient.data.remote.ApiService

class TasksRepository(
    private val api: ApiService
) {
    suspend fun fetchScanStatus(forceRefresh: Boolean = false): ScanTaskStatusResponse {
        return api.getScanTaskStatus(forceRefresh)
    }
}
