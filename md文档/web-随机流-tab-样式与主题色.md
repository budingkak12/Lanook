# Web 随机流页面 Tab（底部导航）样式与两套主题色

给 iOS 同事的实现说明：这里的 “Tab” 指 Web 移动端底部导航（Random/随机流 页面同款），对应实现文件：

- 组件：`webclient/components/mobile-bottom-nav.tsx`
- 主题色变量：`webclient/app/globals.css`

> Web 端全部颜色都来自 CSS 变量（OKLCH）。下文提供 OKLCH 原值 + 转换后的近似 sRGB Hex，便于 iOS 复刻。  
> Hex 为近似值（不同色彩管理/取整会有轻微偏差），如需严格一致可继续用 OKLCH→sRGB 的同一算法。

---

## 1. TabBar 结构与布局

### 1.1 总体

- 位置：固定在屏幕底部 `fixed bottom-0 left-0 right-0`，仅移动端显示（`lg:hidden`）。
- 安全区：外层 `pb-safe`，确保 iPhone 底部安全区不遮挡。
- 背景层：
  - 一层绝对定位的背景块：`bg-card/80 backdrop-blur-lg`。
  - 意味着：**使用卡片色（card）80% 透明度叠加，并且做较强毛玻璃**。
- 内容层：`flex items-center justify-around py-1`，4 个等宽按钮。

### 1.2 单个 TabItem

TabItem 为竖向堆叠：图标 + 文本。

- 点击区域：
  - 布局：`flex flex-col items-center`
  - 内边距：`px-2 py-1.5`（约 8px × 6px）
  - 最小宽度：`flex-1 min-w-0`，4 等分
  - 圆角：`rounded-xl`（约 12px）
  - 动效：`transition-all duration-300`（状态切换 300ms）

- 图标容器：
  - 内边距：`p-1.5`（约 6px）
  - 圆角：`rounded-lg`（约 8px）
  - 图标尺寸：`w-4 h-4`（16×16）

- 文本：
  - 字号：`text-xs`（12px）
  - 字重：`font-medium`
  - 行为：单行截断 `truncate`

### 1.3 状态

- 未激活（Inactive）：
  - 图标/文字颜色：`text-muted-foreground`
  - 图标容器背景：透明
  - 轻交互（hover/press）：图标容器 `bg-muted/50`，文字变为 `text-foreground`

- 激活（Active）：
  - 图标/文字颜色：`text-primary`
  - 图标容器背景：`bg-primary/20`

---

## 2. Tab 文案与图标

顺序与含义（与 Web 一致）：

1. 随机流（feed）- Shuffle 图标  
2. 相册（albums）- FolderOpen 图标  
3. 搜索（search）- Search 图标  
4. 设置（settings）- Settings 图标  

iOS 可用 SF Symbols 找到语义接近的线性图标（常规线宽）。

---

## 3. 两套主题色（用于 TabBar/TabItem）

主题变量来自 `globals.css`。下表给出 OKLCH 与近似 Hex。

### 3.1 亮色主题（:root）

| 语义 | CSS 变量 | OKLCH | 近似 Hex | 用途 |
|---|---|---|---|---|
| 背景 | `--background` | oklch(1 0 0) | #FFFFFF | 页面底色 |
| 主要文字 | `--foreground` | oklch(0.145 0 0) | #0A0A0A | Inactive hover/press 文本 |
| 卡片/TabBar 底色 | `--card` | oklch(0.95 0 0) | #EEEEEE | TabBar 背景基色 |
| 主色/Active 文本 | `--primary` | oklch(0.205 0 0) | #171717 | Active 图标/文字 |
| 次级背景 | `--muted` | oklch(0.94 0 0) | #EBEBEB | Inactive hover 图标容器 |
| 次级文字 | `--muted-foreground` | oklch(0.556 0 0) | #737373 | Inactive 图标/文字 |
| 分割线 | `--border` | oklch(0.922 0 0) | #E5E5E5 | 若 iOS 需要顶部细线 |

透明度叠加（Web 实际观感的近似合成色）：

- TabBar 背景：`card` 80% 叠加在 `background` 上  
  - 基色：#EEEEEE @ 0.8  
  - 合成近似：**#F1F1F1**
- Active 图标容器背景：`primary` 20% 叠加在 TabBar 背景上  
  - 基色：#171717 @ 0.2  
  - 合成近似：**#C5C5C5**
- Inactive 按压/hover 图标容器：`muted` 50% 叠加在 TabBar 背景上  
  - 基色：#EBEBEB @ 0.5  
  - 合成近似：**#EEEEEE**

### 3.2 暗色主题（.dark）

| 语义 | CSS 变量 | OKLCH | 近似 Hex | 用途 |
|---|---|---|---|---|
| 背景 | `--background` | oklch(0.42 0.005 264) | #4C4D50 | 页面底色 |
| 主要文字 | `--foreground` | oklch(0.98 0 0) | #F8F8F8 | Inactive hover/press 文本 |
| 卡片/TabBar 底色 | `--card` | oklch(0.48 0.005 264) | #5C5E60 | TabBar 背景基色 |
| 主色/Active 文本 | `--primary` | oklch(0.98 0 0) | #F8F8F8 | Active 图标/文字 |
| 次级背景 | `--muted` | oklch(0.35 0.005 264) | #393A3D | Inactive hover 图标容器 |
| 次级文字 | `--muted-foreground` | oklch(0.75 0 0) | #AEAEAE | Inactive 图标/文字 |
| 分割线 | `--border` | oklch(0.32 0.005 264) | #313335 | 若 iOS 需要顶部细线 |

透明度叠加（Web 实际观感的近似合成色）：

- TabBar 背景：`card` 80% 叠加在 `background` 上  
  - 基色：#5C5E60 @ 0.8  
  - 合成近似：**#595B5D**
- Active 图标容器背景：`primary` 20% 叠加在 TabBar 背景上  
  - 基色：#F8F8F8 @ 0.2  
  - 合成近似：**#797A7C**
- Inactive 按压/hover 图标容器：`muted` 50% 叠加在 TabBar 背景上  
  - 基色：#393A3D @ 0.5  
  - 合成近似：**#494A4D**

---

## 4. iOS 复刻建议（简要）

- TabBar 可用 `UIBlurEffect` + 半透明背景色叠加：
  - 亮色：card 色 80% alpha  
  - 暗色：card 色 80% alpha
- TabItem 采用竖排图标+文字；Active 使用 primary 色；图标容器单独加 primary 20% alpha 的圆角底。
- Inactive/Pressed 状态保持与 Web 对应的 muted/foreground 变化即可。

