package com.example.mytikt_androidclient.data.api

import com.example.mytikt_androidclient.data.model.MediaListResponse
import com.example.mytikt_androidclient.data.model.SimpleSuccessResponse
import com.example.mytikt_androidclient.data.model.TagOperationRequest
import com.example.mytikt_androidclient.data.model.SessionResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    @GET("session")
    suspend fun createSession(@Query("seed") seed: String? = null): SessionResponse

    @GET("media-resource-list")
    suspend fun getMediaResourceList(
        @Query("seed") seed: String,
        @Query("offset") offset: Int,
        @Query("limit") limit: Int,
        @Query("order") order: String = "seeded"
    ): MediaListResponse

    @POST("tag")
    suspend fun addTag(@Body body: TagOperationRequest): SimpleSuccessResponse

    @HTTP(method = "DELETE", path = "tag", hasBody = true)
    suspend fun removeTag(@Body body: TagOperationRequest): Response<Unit>

    @DELETE("media/{id}")
    suspend fun deleteMedia(
        @Path("id") mediaId: Long,
        @Query("delete_file") deleteFile: Int = 1
    ): Response<Unit>
}
