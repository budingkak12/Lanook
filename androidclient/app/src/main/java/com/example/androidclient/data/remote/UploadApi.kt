package com.example.androidclient.data.remote

import com.example.androidclient.data.model.upload.ChunkStatusResponse
import com.example.androidclient.data.model.upload.FinishUploadRequest
import com.example.androidclient.data.model.upload.FinishUploadResponse
import com.example.androidclient.data.model.upload.InitUploadRequest
import com.example.androidclient.data.model.upload.InitUploadResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

interface UploadApi {
    @POST("upload/init")
    suspend fun initUpload(@Body req: InitUploadRequest): InitUploadResponse

    @Multipart
    @POST("upload/chunk")
    suspend fun uploadChunk(
        @Part("upload_id") uploadId: RequestBody,
        @Part("index") index: RequestBody,
        @Part file: MultipartBody.Part,
        @Part("checksum") checksum: RequestBody? = null
    ): Response<Unit>

    @POST("upload/finish")
    suspend fun finishUpload(@Body req: FinishUploadRequest): FinishUploadResponse

    @GET("upload/{upload_id}")
    suspend fun chunkStatus(@Path("upload_id") uploadId: String): ChunkStatusResponse
}
