package com.example.androidclient.data.model

data class TagOption(
    val name: String,
    val displayName: String? = null
) {
    /**
     * 下拉项展示文本：有译文时为 "译文 : 原文"，否则为原文
     */
    fun displayText(): String = displayName?.let { "$it : $name" } ?: name
}

