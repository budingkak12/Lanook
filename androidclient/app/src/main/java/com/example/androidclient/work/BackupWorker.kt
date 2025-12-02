package com.example.androidclient.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.androidclient.data.backup.BackupDatabaseProvider
import com.example.androidclient.data.backup.BackupRepository
import com.example.androidclient.data.backup.UploadRepository
import com.example.androidclient.di.NetworkModule

class BackupWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val db = BackupDatabaseProvider.get(applicationContext)
        val backupRepo = BackupRepository(db, applicationContext)
        val uploadRepo = UploadRepository(applicationContext, NetworkModule.uploadApi, db)

        val folders = db.folderDao().listAll().filter { it.enabled }
        folders.forEach { folder ->
            backupRepo.scanFolder(folder)
        }

        val uploadResult = uploadRepo.uploadPendingTasks()
        return if (uploadResult.failed == 0) Result.success() else Result.retry()
    }
}
