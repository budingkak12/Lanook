package com.example.androidclient.data.backup

import android.content.Context
import android.net.Uri
import com.example.androidclient.data.model.upload.InitUploadRequest
import com.example.androidclient.data.model.upload.FinishUploadRequest
import com.example.androidclient.data.remote.UploadApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.buffer
import okio.source
import android.os.Build
import kotlin.math.ceil
import kotlin.collections.buildList

class UploadRepository(
    private val context: Context,
    private val uploadApi: UploadApi,
    private val db: BackupDatabase,
    private val chunkSizeBytes: Int = 2 * 1024 * 1024
) {
    private val taskDao = db.taskDao()
    private val folderDao = db.folderDao()
    private val textPlain = "text/plain".toMediaType()

    suspend fun uploadPendingTasks(): UploadResult = withContext(Dispatchers.IO) {
        val pending = buildList {
            addAll(taskDao.tasksByStatusList(BackupTaskStatus.PENDING))
            addAll(taskDao.tasksByStatusList(BackupTaskStatus.FAILED))
        }
        var success = 0
        var failed = 0
        pending.forEach { task ->
            try {
                uploadSingle(task)
                success++
            } catch (e: Exception) {
                failed++
                val latest = taskDao.findById(task.id) ?: task
                taskDao.upsert(
                    latest.copy(
                        status = BackupTaskStatus.FAILED,
                        errorMessage = e.message,
                        updatedAt = System.currentTimeMillis()
                    )
                )
            }
        }

        // 重新统计每个目录的剩余未完成数量，避免 UI 悬挂
        pending.map { it.folderId }.toSet().forEach { folderId ->
            val remain = taskDao.countNotSuccess(folderId)
            folderDao.updatePendingCount(folderId, remain)
        }
        UploadResult(success, failed)
    }

    private suspend fun uploadSingle(task: BackupTask) {
        val resolver = context.contentResolver
        val uri = Uri.parse(task.uri)
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val deviceId = (Build.MODEL ?: "android").replace("\\s+".toRegex(), "_")
        taskDao.upsert(
            task.copy(
                status = BackupTaskStatus.UPLOADING,
                updatedAt = System.currentTimeMillis(),
                errorMessage = null
            )
        )
        val init = uploadApi.initUpload(
            InitUploadRequest(
                filename = task.displayName,
                totalSize = task.size,
                chunkSize = chunkSizeBytes,
                checksum = null,
                deviceId = deviceId,
                mimeType = mime,
                relativePath = task.relativePath,
                modifiedAt = task.modifiedAt
            )
        )

        if (init.existed) {
            taskDao.upsert(
                task.copy(
                    status = BackupTaskStatus.SUCCESS,
                    uploadedBytes = task.size,
                    updatedAt = System.currentTimeMillis(),
                    errorMessage = null
                )
            )
            return
        }

        val uploadIdPart = init.uploadId.toRequestBody(textPlain)
        val skipChunks = init.receivedChunks.toSet()
        val negotiatedChunkSize = init.chunkSize
        val totalChunks = ceil(task.size.toDouble() / negotiatedChunkSize).toInt()

        val input = resolver.openInputStream(uri) ?: throw IllegalStateException("无法读取文件")
        input.use { raw ->
            val buffered = raw.source().buffer()
            var chunkIndex = 0
            var uploadedBytes = 0L
            val buffer = ByteArray(negotiatedChunkSize)
            while (true) {
                var filled = 0
                while (filled < negotiatedChunkSize) {
                    val read = buffered.read(buffer, filled, negotiatedChunkSize - filled)
                    if (read == -1) break
                    filled += read
                    // 为避免长时间阻塞，允许单次循环就结束（即便未充满 chunk），只要读取到数据即可
                    if (filled > 0 && buffered.exhausted()) break
                }
                if (filled == 0) break

                if (skipChunks.contains(chunkIndex)) {
                    uploadedBytes += filled
                    taskDao.upsert(
                        task.copy(
                            status = BackupTaskStatus.UPLOADING,
                            uploadedBytes = uploadedBytes,
                            updatedAt = System.currentTimeMillis(),
                            errorMessage = null
                        )
                    )
                    chunkIndex++
                    continue
                }

                val partBody = buffer.copyOf(filled).toRequestBody(mime.toMediaType(), 0, filled)
                val filePart = MultipartBody.Part.createFormData("file", task.relativePath ?: task.displayName, partBody)
                val indexPart = chunkIndex.toString().toRequestBody(textPlain)
                val resp = uploadApi.uploadChunk(uploadIdPart, indexPart, filePart, null)
                if (!resp.isSuccessful) {
                    throw IllegalStateException("上传分块失败: HTTP ${resp.code()}")
                }
                uploadedBytes += filled
                taskDao.upsert(
                    task.copy(
                        status = BackupTaskStatus.UPLOADING,
                        uploadedBytes = uploadedBytes,
                        updatedAt = System.currentTimeMillis(),
                        errorMessage = null
                    )
                )
                chunkIndex++
            }
        }

        uploadApi.finishUpload(
            FinishUploadRequest(
                uploadId = init.uploadId,
                totalChunks = totalChunks,
                checksum = null,
                skipScan = false
            )
        )

        taskDao.upsert(
            task.copy(
                status = BackupTaskStatus.SUCCESS,
                uploadedBytes = task.size,
                updatedAt = System.currentTimeMillis(),
                errorMessage = null
            )
        )
    }
}

data class UploadResult(val success: Int, val failed: Int)
