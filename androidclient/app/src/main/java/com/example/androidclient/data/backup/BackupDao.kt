package com.example.androidclient.data.backup

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface BackupFolderDao {
    @Query("SELECT * FROM backup_folders ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<BackupFolder>>

    @Query("SELECT * FROM backup_folders")
    suspend fun listAll(): List<BackupFolder>

    @Query("SELECT * FROM backup_folders WHERE uri = :uri LIMIT 1")
    suspend fun findByUri(uri: String): BackupFolder?

    @Upsert
    suspend fun upsert(folder: BackupFolder)

    @Delete
    suspend fun delete(folder: BackupFolder)

    @Query("UPDATE backup_folders SET enabled = :enabled, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateEnabled(id: Long, enabled: Boolean, updatedAt: Long = System.currentTimeMillis())

    @Query("DELETE FROM backup_folders WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE backup_folders SET displayName = :name, includeVideo = :includeVideo, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateFolder(
        id: Long,
        name: String,
        includeVideo: Boolean,
        updatedAt: Long = System.currentTimeMillis()
    )

    @Query("UPDATE backup_folders SET pendingCount = :pending, lastScanAt = :lastScanAt, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updatePending(
        id: Long,
        pending: Int,
        lastScanAt: Long?,
        updatedAt: Long = System.currentTimeMillis()
    )

    @Query("UPDATE backup_folders SET pendingCount = :pending, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updatePendingCount(
        id: Long,
        pending: Int,
        updatedAt: Long = System.currentTimeMillis()
    )
}

@Dao
interface BackupTaskDao {
    @Upsert
    suspend fun upsert(task: BackupTask)

    @Query("SELECT * FROM backup_tasks WHERE folderId = :folderId AND status = :status")
    suspend fun tasksByStatus(folderId: Long, status: BackupTaskStatus): List<BackupTask>

    @Query("SELECT * FROM backup_tasks WHERE status = :status")
    suspend fun tasksByStatusList(status: BackupTaskStatus): List<BackupTask>

    @Query("SELECT * FROM backup_tasks WHERE id = :id LIMIT 1")
    suspend fun findById(id: Long): BackupTask?

    @Query("SELECT * FROM backup_tasks WHERE uri = :uri LIMIT 1")
    suspend fun findByUri(uri: String): BackupTask?

    @Query("SELECT COUNT(*) FROM backup_tasks WHERE folderId = :folderId AND status != :successStatus")
    suspend fun countNotSuccess(folderId: Long, successStatus: BackupTaskStatus = BackupTaskStatus.SUCCESS): Int

    @Query("DELETE FROM backup_tasks WHERE folderId = :folderId")
    suspend fun deleteByFolder(folderId: Long)

    @Query("SELECT * FROM backup_tasks WHERE folderId = :folderId")
    suspend fun tasksForFolder(folderId: Long): List<BackupTask>

    @Query("DELETE FROM backup_tasks WHERE folderId = :folderId AND uri NOT IN (:uris)")
    suspend fun deleteNotIn(folderId: Long, uris: List<String>)
}
