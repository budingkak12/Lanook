package com.example.androidclient

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
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
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.androidclient.data.connection.ConnectionRepository
import com.example.androidclient.di.NetworkModule
import com.example.androidclient.ui.DetailViewScreen
import com.example.androidclient.ui.MainScreen
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.SearchViewModel
import com.example.androidclient.ui.SearchViewModelFactory
import com.example.androidclient.ui.connection.ConnectionScreen
import com.example.androidclient.ui.connection.ConnectionViewModel
import com.example.androidclient.ui.theme.AndroidclientTheme
import com.example.androidclient.util.TagTranslator
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

                val translate = remember { TagTranslator.load(applicationContext) }
                val searchViewModelFactory = remember(translate) { SearchViewModelFactory(NetworkModule.api, translate) }
                val connectionRepository = remember { ConnectionRepository(applicationContext) }
                val connectionViewModel: ConnectionViewModel = viewModel(
                    factory = ConnectionViewModel.Factory(connectionRepository)
                )
                val navController = rememberNavController()
                
                NavHost(
                    navController = navController, 
                    startDestination = "connect"
                ) {
                    composable("connect") {
                        ConnectionScreen(
                            viewModel = connectionViewModel,
                            onConnected = {
                                navController.navigate("main") {
                                    popUpTo("connect") { inclusive = true }
                                }
                            }
                        )
                    }
                    composable("main") {
                        val mainViewModel: MainViewModel = viewModel()
                        val searchViewModel: SearchViewModel = viewModel(factory = searchViewModelFactory)
                        MainScreen(navController, mainViewModel, searchViewModel)
                    }
                    composable(
                        "details/{index}",
                        arguments = listOf(navArgument("index") { type = NavType.IntType }),
                        enterTransition = {
                            slideIntoContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Left,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleIn(
                                initialScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        exitTransition = {
                            slideOutOfContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Right,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleOut(
                                targetScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        popExitTransition = {
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
                        val parentEntry = remember(backStackEntry) { navController.getBackStackEntry("main") }
                        val sharedViewModel: MainViewModel = viewModel(parentEntry)
                        val items = sharedViewModel.thumbnails.collectAsLazyPagingItems()
                        DetailViewScreen(
                            viewModel = sharedViewModel,
                            items = items,
                            initialIndex = index,
                            onBack = { navController.popBackStack() }
                        )
                    }

                    // 搜索结果详情：与随机详情复用组件，但数据源来自 searchVm
                    composable(
                        "search-details/{index}",
                        arguments = listOf(navArgument("index") { type = NavType.IntType }),
                        enterTransition = {
                            slideIntoContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Left,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleIn(
                                initialScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        exitTransition = {
                            slideOutOfContainer(
                                towards = AnimatedContentTransitionScope.SlideDirection.Right,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            ) + scaleOut(
                                targetScale = 0.92f,
                                animationSpec = tween(500, easing = FastOutSlowInEasing)
                            )
                        },
                        popExitTransition = {
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
                        val parentEntry = remember(backStackEntry) { navController.getBackStackEntry("main") }
                        val sharedViewModel: MainViewModel = viewModel(parentEntry)
                        val searchViewModel: SearchViewModel = viewModel(parentEntry, factory = searchViewModelFactory)
                        val items = searchViewModel.thumbnails.collectAsLazyPagingItems()
                        DetailViewScreen(
                            viewModel = sharedViewModel, // 复用同一个 MainViewModel 做点赞/收藏
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
