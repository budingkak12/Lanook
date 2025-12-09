package com.example.androidclient.data.repository

import com.example.androidclient.data.model.fs.FsListResponse
import com.example.androidclient.data.model.fs.FsRoot
import com.example.androidclient.data.model.fs.PathsRequest
import com.example.androidclient.data.remote.ApiService

class FsRepository(private val api: ApiService) {
    suspend fun roots(): List<FsRoot> = api.getFsRoots()

    suspend fun list(
        rootId: String,
        path: String,
        offset: Int = 0,
        limit: Int = 100,
        showHidden: Boolean = false,
        sort: String = "name",
        order: String = "asc",
        mediaOnly: Boolean = true
    ): FsListResponse = api.listFs(rootId, path, offset, limit, showHidden, sort, order, mediaOnly)

    suspend fun mkdir(rootId: String, path: String) = api.mkdir(PathsRequest(rootId = rootId, path = path))

    suspend fun rename(rootId: String, src: String, dst: String) =
        api.rename(PathsRequest(rootId = rootId, srcPath = src, dstPath = dst))

    suspend fun delete(rootId: String, paths: List<String>) =
        api.deletePaths(PathsRequest(rootId = rootId, paths = paths))

    suspend fun move(rootId: String, src: List<String>, dstDir: String) =
        api.move(PathsRequest(rootId = rootId, srcPaths = src, dstDir = dstDir))

    suspend fun copy(rootId: String, src: List<String>, dstDir: String) =
        api.copy(PathsRequest(rootId = rootId, srcPaths = src, dstDir = dstDir))
}
