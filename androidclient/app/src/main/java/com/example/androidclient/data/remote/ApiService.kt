package com.example.androidclient.data.remote
import com.example.androidclient.data.model.TagRequest
import com.example.androidclient.data.model.TagResponse
import com.example.androidclient.data.model.TagListWithTranslationResponse
import com.example.androidclient.data.model.ThumbnailListResponse
import com.example.androidclient.data.model.DeleteBatchRequest
import com.example.androidclient.data.model.DeleteBatchResponse
import com.example.androidclient.data.model.setup.DirectoryEntry
import com.example.androidclient.data.model.setup.DirectoryListResponse
import com.example.androidclient.data.model.setup.InitializationStatusResponse
import com.example.androidclient.data.model.setup.MediaRootRequest
import com.example.androidclient.data.model.tasks.ScanTaskStatusResponse
import com.example.androidclient.data.model.fs.FsRoot
import com.example.androidclient.data.model.fs.FsListResponse
import com.example.androidclient.data.model.fs.PathsRequest
import com.example.androidclient.data.model.fs.SuccessResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    /**
     * 获取媒体列表，支持分页
     * 首次加载或下滑时调用，offset 由 PagingSource 管理
     */
    @GET("media-list")
    suspend fun getMediaList(
        @Query("seed") seed: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 20
    ): ThumbnailListResponse

    /**
     * 按标签获取媒体列表（不使用 seed）
     */
    @GET("media-list")
    suspend fun getMediaListByTag(
        @Query("tag") tag: String,
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 20
    ): ThumbnailListResponse

    @POST("tag")
    suspend fun addTag(@Body req: TagRequest): TagResponse

    @HTTP(method = "DELETE", path = "tag", hasBody = true)
    suspend fun removeTag(@Body req: TagRequest)

    @DELETE("media/{media_id}")
    suspend fun deleteMedia(
        @Path("media_id") mediaId: Int,
        @Query("delete_file") deleteFile: Boolean = true
    )

    /**
     * 批量删除媒体（亦可用于单个删除以获得幂等行为）。
     */
    @POST("media/batch-delete")
    suspend fun batchDelete(@Body req: DeleteBatchRequest): DeleteBatchResponse

    /**
     * 获取全部标签名（英文原名数组）
     * 响应：{"tags": ["like", "favorite", ...]}
     */
    @GET("tags")
    suspend fun getAllTags(): com.example.androidclient.data.model.TagListResponse

    /**
     * 获取全部标签（带译名）
     * 响应：{"tags": [{"name":"aircraft","display_name":"飞机"}, ...]}
     */
    @GET("tags")
    suspend fun getAllTagsWithTranslation(
        @Query("with_translation") withTranslation: Boolean = true
    ): TagListWithTranslationResponse

    @GET("filesystem/roots")
    suspend fun getFilesystemRoots(): List<DirectoryEntry>

    @GET("filesystem/list")
    suspend fun getDirectoryListing(
        @Query("path") path: String
    ): DirectoryListResponse

    @GET("init-status")
    suspend fun getInitializationStatus(): InitializationStatusResponse

    @POST("media-root")
    suspend fun setMediaRoot(
        @Body req: MediaRootRequest
    ): InitializationStatusResponse

    @GET("tasks/scan-progress")
    suspend fun getScanTaskStatus(
        @Query("force_refresh") forceRefresh: Boolean = false
    ): ScanTaskStatusResponse

    // === 文件系统（本机浏览） ===
    @GET("fs/roots")
    suspend fun getFsRoots(): List<FsRoot>

    @GET("fs/list")
    suspend fun listFs(
        @Query("root_id") rootId: String,
        @Query("path") path: String = "",
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 100,
        @Query("show_hidden") showHidden: Boolean = false,
        @Query("sort") sort: String = "name",
        @Query("order") order: String = "asc",
        @Query("media_only") mediaOnly: Boolean = true
    ): FsListResponse

    @POST("fs/mkdir")
    suspend fun mkdir(@Body req: PathsRequest): SuccessResponse

    @POST("fs/rename")
    suspend fun rename(@Body req: PathsRequest): SuccessResponse

    @POST("fs/delete")
    suspend fun deletePaths(@Body req: PathsRequest): SuccessResponse

    @POST("fs/move")
    suspend fun move(@Body req: PathsRequest): SuccessResponse

    @POST("fs/copy")
    suspend fun copy(@Body req: PathsRequest): SuccessResponse

}
