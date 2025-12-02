package com.example.androidclient.data.backup

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "backup_tasks",
    foreignKeys = [
        ForeignKey(
            entity = BackupFolder::class,
            parentColumns = ["id"],
            childColumns = ["folderId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("folderId"), Index("status")]
)
data class BackupTask(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val folderId: Long,
    val uri: String,
    val displayName: String,
    val size: Long,
    val modifiedAt: Long,
    val hash: String? = null,
    val relativePath: String? = null,
    val uploadedBytes: Long = 0,
    val status: BackupTaskStatus = BackupTaskStatus.PENDING,
    val errorMessage: String? = null,
    val retryCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

enum class BackupTaskStatus {
    PENDING,
    UPLOADING,
    SUCCESS,
    FAILED,
    CANCELLED
}
