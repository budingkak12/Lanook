package com.example.androidclient.data.repository

import com.example.androidclient.data.model.TagRequest
import com.example.androidclient.data.remote.ApiService
import retrofit2.HttpException

class TagRepository(
    private val api: ApiService
) {

    suspend fun setLike(mediaId: Int, enabled: Boolean) {
        setTag(mediaId, "like", enabled)
    }

    suspend fun setFavorite(mediaId: Int, enabled: Boolean) {
        setTag(mediaId, "favorite", enabled)
    }

    private suspend fun setTag(mediaId: Int, tag: String, enabled: Boolean) {
        try {
            val req = TagRequest(media_id = mediaId, tag = tag)
            if (enabled) {
                api.addTag(req)
            } else {
                api.removeTag(req)
            }
        } catch (e: HttpException) {
            // 后端若返回已存在(409)或不存在(404)，视为与目标状态一致，无需抛错
            if (enabled && e.code() == 409) return
            if (!enabled && e.code() == 404) return
            throw e
        }
    }
}
