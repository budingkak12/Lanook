package com.example.mytikt_androidclient.data.api

import android.content.Context
import android.content.SharedPreferences

/**
 * API Base URL 的简单配置，尽量贴近 Web 前端的逻辑。
 */
object ApiConfig {
    private const val PREF_NAME = "api_config"
    private const val KEY_API_BASE = "api_base_url"
    private const val DEFAULT_BASE = "http://192.168.1.152:8000/"

    fun getApiBase(context: Context): String {
        val prefs = prefs(context)
        val stored = prefs.getString(KEY_API_BASE, null)
        return sanitizeBaseUrl(stored) ?: DEFAULT_BASE
    }

    fun setApiBase(context: Context, value: String?) {
        val normalized = sanitizeBaseUrl(value)
        prefs(context).edit().apply {
            if (normalized == null) remove(KEY_API_BASE) else putString(KEY_API_BASE, normalized)
        }.apply()
    }

    private fun sanitizeBaseUrl(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()
        val prepared = when {
            trimmed.startsWith("http://", ignoreCase = true) -> trimmed
            trimmed.startsWith("https://", ignoreCase = true) -> trimmed
            trimmed.startsWith("//") -> "http:${trimmed}"
            trimmed.contains("://") -> trimmed
            else -> "http://${trimmed}"
        }
        return if (prepared.endsWith('/')) prepared else "$prepared/"
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
}
