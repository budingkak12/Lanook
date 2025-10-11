package com.example.androidclient

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.ThumbnailGridScreen
import com.example.androidclient.ui.theme.AndroidclientTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AndroidclientTheme {
                val vm = remember { MainViewModel() }
                ThumbnailGridScreen(vm)
            }
        }
    }
}