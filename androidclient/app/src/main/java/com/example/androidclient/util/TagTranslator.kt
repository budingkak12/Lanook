package com.example.androidclient.util

import android.content.Context
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * 从 assets/tags-translate.csv 加载标签译表：每行 `英文,译文`，UTF-8，无表头。
 * - 解析到首个格式错误的行会停止（保持已解析部分），与后端容错一致。
 * - 文件缺失或读取出错时返回空表。
 */
object TagTranslator {
    private const val FILE_NAME = "tags-translate.csv"

    fun load(context: Context): Map<String, String> {
        return runCatching {
            context.assets.open(FILE_NAME).use { input ->
                BufferedReader(InputStreamReader(input, Charsets.UTF_8)).use { br ->
                    val map = LinkedHashMap<String, String>()
                    var line: String?
                    while (true) {
                        line = br.readLine() ?: break
                        val trimmed = line!!.trim()
                        if (trimmed.isEmpty()) continue
                        if (trimmed.count { it == ',' } != 1) {
                            // 没有恰好一个逗号：与约定一致，抛错并整体停止，保留已解析部分
                            throw IllegalArgumentException("invalid csv line: $trimmed")
                        }
                        val commaIndex = trimmed.indexOf(',')
                        val en = trimmed.substring(0, commaIndex).trim()
                        val zh = trimmed.substring(commaIndex + 1).trim()
                        if (en.isNotEmpty() && zh.isNotEmpty()) {
                            map[en] = zh
                        }
                    }
                    map
                }
            }
        }.getOrElse { emptyMap() }
    }
}
