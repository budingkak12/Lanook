package com.example.androidclient

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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
import com.google.accompanist.systemuicontroller.rememberSystemUiController

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AndroidclientTheme {
                val view = LocalView.current
                if (!view.isInEditMode) {
                    DisposableEffect(Unit) {
                        val window = (view.context as Activity).window
                        val insetsController = WindowCompat.getInsetsController(window, view)
                        insetsController.hide(WindowInsetsCompat.Type.statusBars())
                        insetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        onDispose {
                            insetsController.show(WindowInsetsCompat.Type.statusBars())
                        }
                    }
                }

                val systemUiController = rememberSystemUiController()
                SideEffect {
                    systemUiController.setSystemBarsColor(
                        color = Color.Transparent,
                        darkIcons = false
                    )
                }

                val vm = remember { MainViewModel() }
                val navController = rememberNavController()
                val items = vm.thumbnails.collectAsLazyPagingItems()
                
                NavHost(
                    navController = navController, 
                    startDestination = "thumbnails"
                ) {
                    composable(
                        "thumbnails",
                        enterTransition = {
                            // 从详情页返回时的动效：从右侧滑入（时长更长以更明显）
                            slideIntoContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Right,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        exitTransition = {
                            // 进入详情页时的动效：向左滑出（时长更长以更明显）
                            slideOutOfContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Left,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        popEnterTransition = {
                            // 返回缩略图页时的动效：从左向右滑入（时长更长以更明显）
                            slideIntoContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Right,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        }
                    ) {
                        ThumbnailGridScreen(vm) { index ->
                            navController.navigate("details/$index")
                        }
                    }
                    composable(
                        "details/{index}",
                        arguments = listOf(navArgument("index") { type = NavType.IntType }),
                        enterTransition = {
                            // 进入详情页时的动效：从右侧滑入 + 轻微缩放（时长更长以更明显）
                            slideIntoContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Left,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleIn(
                                initialScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        exitTransition = {
                            // 返回缩略图页时的动效：向右滑出 + 轻微缩放（时长更长以更明显）
                            slideOutOfContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Right,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleOut(
                                targetScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        popExitTransition = {
                            // 返回时详情页的动效：向右滑出 + 轻微缩放（时长更长以更明显）
                            slideOutOfContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Right,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleOut(
                                targetScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        }
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