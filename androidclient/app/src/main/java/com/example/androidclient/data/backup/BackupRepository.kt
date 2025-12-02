package com.example.androidclient.data.backup

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withContext
import androidx.documentfile.provider.DocumentFile
import android.content.Context
import android.webkit.MimeTypeMap
import android.net.Uri
import kotlinx.coroutines.Dispatchers

class BackupRepository(
    private val database: BackupDatabase,
    private val context: Context
) {
    private val folderDao = database.folderDao()
    private val taskDao = database.taskDao()

    fun folders(): Flow<List<BackupFolder>> = folderDao.observeAll()

    suspend fun addFolder(folder: BackupFolder): AddFolderResult {
        val existingAll = folderDao.listAll()
        existingAll.forEach { exist ->
            if (exist.uri == folder.uri) return AddFolderResult.Duplicate
            if (exist.uri.startsWith(folder.uri)) return AddFolderResult.ParentConflict(exist.displayName)
            if (folder.uri.startsWith(exist.uri)) return AddFolderResult.ChildConflict(exist.displayName)
        }
        folderDao.upsert(folder)
        return AddFolderResult.Added
    }

    suspend fun toggleFolder(id: Long, enabled: Boolean) {
        folderDao.updateEnabled(id, enabled, System.currentTimeMillis())
    }

    suspend fun deleteFolder(id: Long) {
        folderDao.deleteById(id)
    }

    suspend fun updateFolder(id: Long, name: String) {
        folderDao.updateFolder(id, name, true, System.currentTimeMillis())
    }

    suspend fun updatePending(id: Long, pending: Int, lastScanAt: Long?) {
        folderDao.updatePending(id, pending, lastScanAt, System.currentTimeMillis())
    }

    /**
     * 扫描目录，生成/更新任务并返回待上传数量。
     * 去重策略：uri 精确匹配；若同 uri 已存在且状态成功则跳过；否则刷新 size/mtime 并置为 PENDING。
     */
    suspend fun scanFolder(folder: BackupFolder): Int = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val root = DocumentFile.fromTreeUri(context, Uri.parse(folder.uri)) ?: return@withContext 0
        val tasks = mutableListOf<BackupTask>()

        fun traverse(file: DocumentFile) {
            if (!file.canRead()) return
            if (file.name?.startsWith(".") == true) return
            if (file.isDirectory) {
                file.listFiles().forEach { traverse(it) }
            } else {
                val mime = file.type ?: guessMime(file.name ?: "")
                val isVideo = mime.startsWith("video")
                val isImage = mime.startsWith("image")
                if (!isImage && !isVideo) return
                val size = file.length()
                val mtime = file.lastModified()
                val task = BackupTask(
                    folderId = folder.id,
                    uri = file.uri.toString(),
                    displayName = file.name ?: "unknown",
                    size = size,
                    modifiedAt = mtime,
                    relativePath = buildRelativePath(root, file),
                    status = BackupTaskStatus.PENDING,
                    uploadedBytes = 0,
                    updatedAt = System.currentTimeMillis()
                )
                tasks.add(task)
            }
        }

        traverse(root)

        // 按 uri 去重更新，同时清理已删除文件
        val seenUris = tasks.map { it.uri }
        val existingTasks = taskDao.tasksForFolder(folder.id)

        if (seenUris.isNotEmpty()) {
            taskDao.deleteNotIn(folder.id, seenUris)
        } else {
            taskDao.deleteByFolder(folder.id)
        }

        var pendingCount = 0
        tasks.forEach { task ->
            val existing = taskDao.findByUri(task.uri)
            if (existing != null) {
                val unchanged = existing.size == task.size && existing.modifiedAt == task.modifiedAt
                val newStatus = if (unchanged && existing.status == BackupTaskStatus.SUCCESS) BackupTaskStatus.SUCCESS else BackupTaskStatus.PENDING
                taskDao.upsert(existing.copy(
                    size = task.size,
                    modifiedAt = task.modifiedAt,
                    status = newStatus,
                    uploadedBytes = if (newStatus == BackupTaskStatus.SUCCESS) existing.uploadedBytes else 0,
                    updatedAt = System.currentTimeMillis()
                ))
                if (newStatus != BackupTaskStatus.SUCCESS) pendingCount++
            } else {
                taskDao.upsert(task)
                pendingCount++
            }
        }

        folderDao.updatePending(folder.id, pendingCount, System.currentTimeMillis())
        pendingCount
    }

    private fun guessMime(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        val mapped = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
        return mapped ?: "application/octet-stream"
    }

    private fun buildRelativePath(root: DocumentFile, file: DocumentFile): String {
        // SAF 的 DocumentFile 没有直接的相对路径，利用 URI 去掉根 URI 前缀并清理分隔符
        val rootUri = root.uri.toString().trimEnd('/')
        val fileUri = file.uri.toString()
        val relative = fileUri.removePrefix(rootUri).removePrefix("/")
        return relative.ifBlank { file.name ?: "unknown" }
    }
}

sealed interface AddFolderResult {
    data object Added : AddFolderResult
    data object Duplicate : AddFolderResult
    data class ParentConflict(val name: String) : AddFolderResult
    data class ChildConflict(val name: String) : AddFolderResult
}
