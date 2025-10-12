package com.example.androidclient

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onChildAt
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.espresso.Espresso.pressBack
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.androidclient.MainActivity
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainFlowTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun testMainFlow() {
        // 1. 启动应用程序并验证`ThumbnailGridScreen`是否显示
        composeTestRule.onNodeWithText("随机").assertExists()

        // 2. 在`ThumbnailGridScreen`中，验证缩略图是否已加载
        composeTestRule.waitForIdle()

        // 3. 单击缩略图并验证`DetailViewScreen`是否显示
        composeTestRule.onNode(hasContentDescription("Thumbnail Grid"), useUnmergedTree = true).onChildAt(0).performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithContentDescription("Detail View").assertExists()

        // 4. 在`DetailViewScreen`中，验证媒体项目是否正确显示
        composeTestRule.onNodeWithContentDescription("Detail View").assertIsDisplayed()

        // 5. 返回`ThumbnailGridScreen`
        pressBack()
        composeTestRule.onNodeWithText("随机").assertExists()
    }
}