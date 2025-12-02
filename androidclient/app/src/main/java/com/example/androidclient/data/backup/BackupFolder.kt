package com.example.androidclient.data.backup

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "backup_folders")
data class BackupFolder(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val uri: String,
    val displayName: String,
    val includeVideo: Boolean = true,
    val enabled: Boolean = true,
    val pendingCount: Int = 0,
    val lastScanAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
