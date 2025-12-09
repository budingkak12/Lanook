package com.example.androidclient.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PhotoAlbum
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.androidclient.data.repository.FsRepository
import com.example.androidclient.di.NetworkModule
import com.example.androidclient.ui.files.FileBrowserScreen
import com.example.androidclient.ui.files.FileBrowserViewModel
import com.example.androidclient.ui.settings.SettingsScreen

sealed class Screen(val route: String, val icon: ImageVector, val title: String) {
    object Random : Screen("random", Icons.Filled.Home, "随机")
    object Album : Screen("album", Icons.Filled.PhotoAlbum, "相册")
    object Files : Screen("files", Icons.Filled.Folder, "本机文件")
    object Search : Screen("search", Icons.Filled.Search, "搜索")
    object Settings : Screen("settings", Icons.Filled.Settings, "设置")
}

val items = listOf(
    Screen.Random,
    Screen.Files,
    Screen.Search,
    Screen.Settings,
)

@Composable
fun MainScreen(mainNavController: NavController, vm: MainViewModel, searchVm: SearchViewModel) {
    val innerNavController = rememberNavController()
    val layoutDirection = LocalLayoutDirection.current
    val fsVm: FileBrowserViewModel = viewModel(factory = object : androidx.lifecycle.ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
            return FileBrowserViewModel(FsRepository(NetworkModule.api)) as T
        }
    })

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            // 恢复系统导航栏内边距，避免被系统导航栏遮挡
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.background,
                windowInsets = NavigationBarDefaults.windowInsets
            ) {
                val navBackStackEntry by innerNavController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                items.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = null) },
                        label = { Text(screen.title) },
                        selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                        onClick = {
                            innerNavController.navigate(screen.route) {
                                popUpTo(innerNavController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        // 仅保留顶部/左右的系统间距，底部给出 8dp 呼吸空间，避免与导航栏紧贴
        val contentPadding = PaddingValues(
            start = innerPadding.calculateStartPadding(layoutDirection),
            top = innerPadding.calculateTopPadding(),
            end = innerPadding.calculateEndPadding(layoutDirection),
            bottom = innerPadding.calculateBottomPadding() + 8.dp
        )
        NavHost(
            navController = innerNavController,
            startDestination = Screen.Random.route,
            modifier = Modifier.padding(contentPadding)
        ) {
            composable(Screen.Random.route) {
                ThumbnailGridScreen(vm) { index ->
                    mainNavController.navigate("details/$index")
                }
            }
            composable(Screen.Album.route) {
                Text("Album Screen")
            }
            composable(Screen.Files.route) {
                FileBrowserScreen(vm = fsVm)
            }
            composable(Screen.Search.route) {
                SearchScreen(
                    navController = mainNavController,
                    searchViewModel = searchVm
                )
            }
            composable(Screen.Settings.route) {
                SettingsScreen(
                    onViewTasks = { mainNavController.navigate("tasks") },
                    onOpenBackup = { mainNavController.navigate("backup") }
                )
            }
        }
    }
}
