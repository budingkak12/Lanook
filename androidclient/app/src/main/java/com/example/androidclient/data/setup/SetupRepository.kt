package com.example.androidclient.data.setup

import com.example.androidclient.data.model.setup.DirectoryEntry
import com.example.androidclient.data.model.setup.DirectoryListResponse
import com.example.androidclient.data.model.setup.InitializationStatusResponse
import com.example.androidclient.data.model.setup.MediaRootRequest
import com.example.androidclient.data.remote.ApiService

class SetupRepository(
    private val api: ApiService
) {

    suspend fun fetchRoots(): List<DirectoryEntry> = api.getFilesystemRoots()

    suspend fun listDirectory(path: String): DirectoryListResponse = api.getDirectoryListing(path)

    suspend fun submitMediaRoot(path: String): InitializationStatusResponse =
        api.setMediaRoot(MediaRootRequest(path))

    suspend fun fetchStatus(): InitializationStatusResponse = api.getInitializationStatus()
}
