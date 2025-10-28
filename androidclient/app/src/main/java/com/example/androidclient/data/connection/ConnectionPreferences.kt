package com.example.androidclient.data.connection

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private const val DATASTORE_NAME = "connection_settings"

val Context.connectionDataStore: DataStore<Preferences> by preferencesDataStore(name = DATASTORE_NAME)

object ConnectionPreferences {
    private val KEY_BASE_URL = stringPreferencesKey("base_url")

    fun baseUrlFlow(context: Context): Flow<String?> =
        context.connectionDataStore.data.map { prefs -> prefs[KEY_BASE_URL] }

    suspend fun writeBaseUrl(context: Context, baseUrl: String) {
        context.connectionDataStore.edit { prefs ->
            prefs[KEY_BASE_URL] = baseUrl
        }
    }
}
