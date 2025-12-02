package com.example.androidclient.data.backup

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [BackupFolder::class, BackupTask::class],
    version = 2,
    exportSchema = false
)
@TypeConverters(BackupConverters::class)
abstract class BackupDatabase : RoomDatabase() {
    abstract fun folderDao(): BackupFolderDao
    abstract fun taskDao(): BackupTaskDao
}

object BackupDatabaseProvider {
    @Volatile
    private var instance: BackupDatabase? = null

    fun get(context: Context): BackupDatabase {
        return instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                BackupDatabase::class.java,
                "backup.db"
            ).fallbackToDestructiveMigration().build().also { instance = it }
        }
    }
}
