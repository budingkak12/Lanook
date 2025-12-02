package com.example.androidclient

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
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
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.paging.compose.collectAsLazyPagingItems
import com.example.androidclient.data.connection.ConnectionRepository
import com.example.androidclient.data.model.setup.InitializationState
import com.example.androidclient.data.repository.TasksRepository
import com.example.androidclient.data.setup.SetupRepository
import com.example.androidclient.di.NetworkModule
import com.example.androidclient.ui.DetailViewScreen
import com.example.androidclient.ui.MainScreen
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.SearchViewModel
import com.example.androidclient.ui.SearchViewModelFactory
import com.example.androidclient.ui.backup.BackupPermissionViewModel
import com.example.androidclient.ui.backup.BackupPermissionViewModelFactory
import com.example.androidclient.ui.backup.BackupSettingsScreen
import com.example.androidclient.ui.connection.ConnectionScreen
import com.example.androidclient.ui.connection.ConnectionViewModel
import com.example.androidclient.ui.navigation.NavigationTransitions
import com.example.androidclient.ui.theme.AndroidclientTheme
import com.example.androidclient.ui.settings.TasksScreen
import com.example.androidclient.ui.settings.TasksViewModel
import com.example.androidclient.ui.settings.TasksViewModelFactory
import com.example.androidclient.ui.setup.ChooseMediaPathScreen
import com.example.androidclient.ui.setup.SetupViewModel
import com.example.androidclient.util.TagTranslator
import com.google.accompanist.systemuicontroller.rememberSystemUiController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val connectionRepository = ConnectionRepository(applicationContext)
        val startupConfig = resolveStartupConfig(connectionRepository)
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
                val connectionViewModel: ConnectionViewModel = viewModel(
                    factory = ConnectionViewModel.Factory(connectionRepository)
                )
                val navController = rememberNavController()
                val startDestination = remember { startupConfig.startDestination }
                
                NavHost(
                    navController = navController,
                    startDestination = startDestination
                ) {
                    composable(
                        "connect",
                        enterTransition = {
                            NavigationTransitions.enter(this)
                        },
                        exitTransition = {
                            val target = targetState.destination.route
                            if (target == "main" || target == "setup") {
                                ExitTransition.None
                            } else {
                                NavigationTransitions.exit(this)
                            }
                        },
                        popEnterTransition = {
                            NavigationTransitions.popEnter(this)
                        },
                        popExitTransition = {
                            NavigationTransitions.popExit(this)
                        }
                    ) {
                        ConnectionScreen(
                            viewModel = connectionViewModel,
                            onConnected = { _, requiresSetup ->
                                if (requiresSetup) {
                                    navController.navigate("setup")
                                } else {
                                    navController.navigate("main") {
                                        popUpTo("connect") { inclusive = true }
                                    }
                                }
                            }
                        )
                    }
                    composable(
                        "setup",
                        enterTransition = {
                            if (initialState.destination.route == "connect") {
                                EnterTransition.None
                            } else {
                                NavigationTransitions.enter(this)
                            }
                        },
                        exitTransition = {
                            val target = targetState.destination.route
                            if (target == "connect") {
                                ExitTransition.None
                            } else {
                                NavigationTransitions.exit(this)
                            }
                        },
                        popEnterTransition = {
                            if (initialState.destination.route == "connect") {
                                EnterTransition.None
                            } else {
                                NavigationTransitions.popEnter(this)
                            }
                        },
                        popExitTransition = {
                            if (targetState.destination.route == "connect") {
                                ExitTransition.None
                            } else {
                                NavigationTransitions.popExit(this)
                            }
                        }
                    ) {
                        val setupViewModel: SetupViewModel = viewModel(
                            factory = SetupViewModel.Factory(SetupRepository(NetworkModule.api))
                        )
                        ChooseMediaPathScreen(
                            viewModel = setupViewModel,
                            onInitialized = {
                                navController.navigate("main") {
                                    popUpTo("connect") { inclusive = true }
                                }
                            },
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable(
                        "main",
                        enterTransition = {
                            if (initialState.destination.route == "connect") {
                                EnterTransition.None
                            } else {
                                NavigationTransitions.enter(this)
                            }
                        },
                        exitTransition = {
                            val target = targetState.destination.route
                            if (target == "connect") {
                                ExitTransition.None
                            } else {
                                NavigationTransitions.exit(this)
                            }
                        },
                        popEnterTransition = {
                            if (initialState.destination.route == "connect") {
                                EnterTransition.None
                            } else {
                                NavigationTransitions.popEnter(this)
                            }
                        },
                        popExitTransition = {
                            if (targetState.destination.route == "connect") {
                                ExitTransition.None
                            } else {
                                NavigationTransitions.popExit(this)
                            }
                        }
                    ) {
                        val searchViewModelFactory = remember(NetworkModule.currentBaseUrl(), translate) {
                            SearchViewModelFactory(NetworkModule.api, translate)
                        }
                        val mainViewModel: MainViewModel = viewModel()
                        val searchViewModel: SearchViewModel = viewModel(factory = searchViewModelFactory)
                        MainScreen(navController, mainViewModel, searchViewModel)
                    }
                    composable(
                        "tasks",
                        enterTransition = NavigationTransitions.enter,
                        exitTransition = NavigationTransitions.exit,
                        popEnterTransition = NavigationTransitions.popEnter,
                        popExitTransition = NavigationTransitions.popExit
                    ) {
                        val tasksViewModel: TasksViewModel = viewModel(
                            factory = TasksViewModelFactory(TasksRepository(NetworkModule.api))
                        )
                        TasksScreen(
                            viewModel = tasksViewModel,
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable(
                        "backup",
                        enterTransition = NavigationTransitions.enter,
                        exitTransition = NavigationTransitions.exit,
                        popEnterTransition = NavigationTransitions.popEnter,
                        popExitTransition = NavigationTransitions.popExit
                    ) {
                        val backupViewModel: BackupPermissionViewModel = viewModel(
                            factory = BackupPermissionViewModelFactory(this@MainActivity.application)
                        )
                        BackupSettingsScreen(
                            viewModel = backupViewModel,
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable(
                        "details/{index}",
                        arguments = listOf(navArgument("index") { type = NavType.IntType }),
                        enterTransition = NavigationTransitions.enter,
                        exitTransition = NavigationTransitions.exit,
                        popEnterTransition = NavigationTransitions.popEnter,
                        popExitTransition = NavigationTransitions.popExit
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
                        enterTransition = NavigationTransitions.enter,
                        exitTransition = NavigationTransitions.exit,
                        popEnterTransition = NavigationTransitions.popEnter,
                        popExitTransition = NavigationTransitions.popExit
                    ) { backStackEntry ->
                        val index = backStackEntry.arguments?.getInt("index") ?: 0
                        val parentEntry = remember(backStackEntry) { navController.getBackStackEntry("main") }
                        val sharedViewModel: MainViewModel = viewModel(parentEntry)
                        val searchViewModel: SearchViewModel = viewModel(parentEntry)
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

    private fun resolveStartupConfig(repository: ConnectionRepository): StartupConfig = runBlocking {
        val stored = withContext(Dispatchers.IO) { repository.storedBaseUrl().firstOrNull() }
        val canonical = stored?.let { repository.canonicalize(it) }
        if (canonical.isNullOrBlank()) {
            StartupConfig(
                baseUrl = null,
                startDestination = "connect"
            )
        } else {
            NetworkModule.updateBaseUrl(canonical)
            val requiresSetup = withContext(Dispatchers.IO) {
                runCatching {
                    val repo = SetupRepository(NetworkModule.api)
                    val status = repo.fetchStatus()
                    status.state != InitializationState.COMPLETED || status.mediaRootPath.isNullOrBlank()
                }.getOrDefault(false)
            }
            StartupConfig(
                baseUrl = canonical,
                startDestination = if (requiresSetup) "setup" else "main"
            )
        }
    }

    private data class StartupConfig(
        val baseUrl: String?,
        val startDestination: String
    )
}
