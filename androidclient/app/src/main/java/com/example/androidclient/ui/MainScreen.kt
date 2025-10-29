package com.example.androidclient.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PhotoAlbum
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavController
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.androidclient.data.repository.SettingsRepository
import com.example.androidclient.di.NetworkModule
import com.example.androidclient.ui.MainViewModel
import com.example.androidclient.ui.ThumbnailGridScreen
import com.example.androidclient.ui.settings.SettingsScreen
import com.example.androidclient.ui.settings.SettingsViewModel
import com.example.androidclient.ui.settings.SettingsViewModelFactory

sealed class Screen(val route: String, val icon: ImageVector, val title: String) {
    object Random : Screen("random", Icons.Filled.Home, "随机")
    object Album : Screen("album", Icons.Filled.PhotoAlbum, "相册")
    object Search : Screen("search", Icons.Filled.Search, "搜索")
    object Settings : Screen("settings", Icons.Filled.Settings, "设置")
}

val items = listOf(
    Screen.Random,
    Screen.Album,
    Screen.Search,
    Screen.Settings,
)

@Composable
fun MainScreen(mainNavController: NavController, vm: MainViewModel, searchVm: SearchViewModel) {
    val innerNavController = rememberNavController()

    Scaffold(
        bottomBar = {
            NavigationBar {
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
        NavHost(
            navController = innerNavController,
            startDestination = Screen.Random.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Random.route) {
                ThumbnailGridScreen(vm) { index ->
                    mainNavController.navigate("details/$index")
                }
            }
            composable(Screen.Album.route) {
                // TODO: Replace with actual Album screen
                Text("Album Screen")
            }
            composable(Screen.Search.route) {
                SearchScreen(
                    navController = mainNavController,
                    searchViewModel = searchVm
                )
            }
            composable(Screen.Settings.route) {
                val settingsViewModel: SettingsViewModel = viewModel(
                    factory = SettingsViewModelFactory(SettingsRepository(NetworkModule.api))
                )
                SettingsScreen(
                    viewModel = settingsViewModel,
                    onViewTasks = {
                        mainNavController.navigate("tasks")
                    }
                )
            }
        }
    }
}
