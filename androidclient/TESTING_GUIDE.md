# Android 端到端测试指南

本文档旨在说明如何运行和理解项目中的 Android 端到端（E2E）测试脚本。

## 1. 测试脚本实现

测试脚本位于 `app/src/androidTest/java/com/example/androidclient/MainFlowTest.kt`。

它主要使用以下技术实现：

- **JUnit 4**: 一个标准的 Java 测试框架。
- **AndroidX Test**: 提供了在 Android 设备上运行 JUnit 测试的能力。
- **Jetpack Compose Test**: 专门用于测试 Jetpack Compose UI 的一套 API。我们使用 `createAndroidComposeRule` 来启动 `MainActivity` 并与 UI 组件进行交互。

测试通过查找UI元素的 `contentDescription`（内容描述）来定位和断言组件是否存在。例如，它会查找 `contentDescription = "Thumbnail Grid"` 来确认主网格视图已加载。

## 2. 测试脚本功能

该脚本覆盖了应用的核心用户流程，确保最基本的功能可以正常工作。具体流程如下：

1.  **启动应用**：自动启动 `MainActivity`。
2.  **验证主屏幕**：检查缩略图网格 (`ThumbnailGridScreen`) 是否正确显示。
3.  **导航到详情页**：模拟用户点击第一个缩略图，并验证应用是否成功导航到详情页 (`DetailViewScreen`)。
4.  **返回主屏幕**：模拟用户点击返回按钮，并验证应用是否成功返回到缩略图网格界面。

这个测试可以有效地防止后续开发中对核心功能的意外破坏。

## 3. 如何执行测试

您可以非常方便地通过 Gradle 命令来运行此测试。

1.  确保您已连接了一个 Android 设备或启动了一个模拟器。
2.  在 `androidclient` 目录下打开终端。
3.  执行以下命令：

    ```shell
    .\gradlew.bat connectedAndroidTest
    ```

4.  命令执行完毕后，Gradle 会输出测试结果。如果显示 `BUILD SUCCESSFUL`，则表示所有测试都已通过。

通过遵循本指南，您可以轻松地在开发周期中利用这个自动化测试来保证应用的质量。