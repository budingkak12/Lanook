package com.example.mytikt_androidclient

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.mytikt_androidclient.ui.theme.Mytikt_androidclientTheme
import com.example.mytikt_androidclient.ui.home.HomeRoute

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Mytikt_androidclientTheme {
                HomeRoute()
            }
        }
    }
}
