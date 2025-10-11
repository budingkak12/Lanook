package com.example.androidclient

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.androidclient.ui.DetailViewScreen
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.ThumbnailGridScreen
import com.example.androidclient.ui.theme.AndroidclientTheme
import androidx.paging.compose.collectAsLazyPagingItems

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AndroidclientTheme {
                val vm = remember { MainViewModel() }
                val navController = rememberNavController()
                val items = vm.thumbnails.collectAsLazyPagingItems()
                NavHost(navController = navController, startDestination = "thumbnails") {
                    composable("thumbnails") {
                        ThumbnailGridScreen(vm) { index ->
                            navController.navigate("details/$index")
                        }
                    }
                    composable(
                        "details/{index}",
                        arguments = listOf(navArgument("index") { type = NavType.IntType })
                    ) { backStackEntry ->
                        val index = backStackEntry.arguments?.getInt("index") ?: 0
                        DetailViewScreen(
                            items = items,
                            initialIndex = index,
                            onBack = { navController.popBackStack() }
                        )
                    }
                }
            }
        }
    }
}