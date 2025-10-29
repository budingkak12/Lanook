package com.example.androidclient.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.navigation.NavBackStackEntry

/**
 * 定义全局统一的页面切换动画，参考系统设置的左右滑入/滑出效果。
 */
object NavigationTransitions {
    val enter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        slideInHorizontally(
            animationSpec = tween(
                durationMillis = TransitionDurations.default,
                easing = LinearOutSlowInEasing
            ),
            initialOffsetX = { fullWidth -> fullWidth }
        ) + fadeIn(animationSpec = tween(TransitionDurations.default, easing = FastOutSlowInEasing))
    }

    val exit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        slideOutHorizontally(
            animationSpec = tween(
                durationMillis = TransitionDurations.default,
                easing = FastOutLinearInEasing
            ),
            targetOffsetX = { fullWidth -> -fullWidth / 3 }
        ) + fadeOut(animationSpec = tween(TransitionDurations.default, easing = FastOutLinearInEasing))
    }

    val popEnter: AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
        slideInHorizontally(
            animationSpec = tween(
                durationMillis = TransitionDurations.default,
                easing = LinearOutSlowInEasing
            ),
            initialOffsetX = { fullWidth -> -fullWidth / 3 }
        ) + fadeIn(animationSpec = tween(TransitionDurations.default, easing = FastOutSlowInEasing))
    }

    val popExit: AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
        slideOutHorizontally(
            animationSpec = tween(
                durationMillis = TransitionDurations.default,
                easing = FastOutLinearInEasing
            ),
            targetOffsetX = { fullWidth -> fullWidth }
        ) + fadeOut(animationSpec = tween(TransitionDurations.default, easing = FastOutLinearInEasing))
    }

    private object TransitionDurations {
        const val default: Int = 300
    }
}
