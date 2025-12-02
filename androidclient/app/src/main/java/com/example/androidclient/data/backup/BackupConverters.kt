package com.example.androidclient.data.backup

import androidx.room.TypeConverter

class BackupConverters {
    @TypeConverter
    fun toStatus(value: String?): BackupTaskStatus? = value?.let { BackupTaskStatus.valueOf(it) }

    @TypeConverter
    fun fromStatus(status: BackupTaskStatus?): String? = status?.name
}
