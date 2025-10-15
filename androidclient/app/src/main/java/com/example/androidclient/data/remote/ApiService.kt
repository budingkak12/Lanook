package com.example.androidclient.data.remote

import com.example.androidclient.data.model.SessionResponse
import com.example.androidclient.data.model.TagRequest
import com.example.androidclient.data.model.TagResponse
import com.example.androidclient.data.model.ThumbnailListResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {

    /**
     * 获取缩略图列表，支持分页
     * 首次加载或下滑时调用，offset 由 PagingSource 管理
     */
    /**
     * 获取会话种子
     */
    @GET("session")
    suspend fun getSession(): SessionResponse

    /**
     * 获取缩略图列表，支持分页
     * 首次加载或下滑时调用，offset 由 PagingSource 管理
     */
    @GET("thumbnail-list")
    suspend fun getThumbnailList(
        @Query("seed") seed: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 20
    ): ThumbnailListResponse

    /**
     * 按标签获取缩略图列表（不使用 seed）
     */
    @GET("thumbnail-list")
    suspend fun getThumbnailListByTag(
        @Query("tag") tag: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 20
    ): ThumbnailListResponse

    @POST("tag")
    suspend fun addTag(@Body req: TagRequest): TagResponse

    @HTTP(method = "DELETE", path = "tag", hasBody = true)
    suspend fun removeTag(@Body req: TagRequest)
}
