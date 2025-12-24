# 跨端 UI 对齐：iOS 设置页复刻 Web Demo（经验总结）

本文记录本次 iOS 端“设置页”复刻 Web（`/ui-demo`）的做法与经验，目标是为后续 Android 端实现提供可复用的规则与组件清单，确保三端在**配色、层级、交互（展开/收起）**上尽量一致。

> 范围说明：本文聚焦“设置页（含 存储与任务 / Storage & Tasks 这一块）”与其底层设计系统组件；不涉及业务逻辑、网络请求等。

---

## 1. Web 侧参考来源（真相来源）

### 1.0 本次参考的关键提交

本次跨端对齐（原生端可参考组件设计）的关键提交：
- `2130206e7d40b87d0d3b6c69cd4ba896146b28cf`

该提交主要引入了“跨端可复用的 UI 设计参数（design tokens）”，并在 Web Demo 页面中补充了跨端说明文字。

### 1.1 Demo 参考页面
- Web Demo 页面：`webclient/components/ui-demo-view.tsx`
- Demo 中的“存储与任务块”：`webclient/components/ui-demo-storage-tasks.tsx`

这两个文件定义了我们对齐的核心：  
外层设置块（可展开）→ 内部功能卡片 → 扁平可勾选列表（安检门/入库扫描模式/间隔）→ 其它占位区域。

### 1.2 Web 亮色主题的颜色变量（必须对齐）
- Web 亮色主题变量：`webclient/app/globals.css`
  - `--background: rgb(212 215 218)`（页面底色 / L0）
  - `--card: rgb(251 251 251)`（卡片底色 / L1）
  - `--muted: rgb(240 242 244)`（按压/辅助底色 / L2）
  - `--border: rgb(228 231 234)`（分割线/边框）
  - `--foreground: rgb(74 77 78)`（主文字）
  - `--muted-foreground: rgb(120 123 124)`（次文字）

结论：如果 iOS 继续使用系统动态色（`systemBackground` / `.secondary` / `Divider()`），肉眼必然与 Web 不一致；本次在 iOS 设置页区域改为**使用 Web 亮色同款 token**。

### 1.3 Web 端 design tokens（跨端 UI 参数）

提交 `2130206e...` 新增/引入了两份 tokens JSON（原因是 Web 构建与仓库根目录导入路径限制）：

- 仓库根（更适合给原生端当“参考源/拷贝源”）：`design-tokens/ui.json`
- Web 端可直接 import（Next.js 侧边界更安全）：`webclient/design-tokens/ui.json`

Web 端导入入口（给 TS 侧使用/类型检查）：
- `webclient/lib/design-tokens.ts`

> 重要：Next.js/前端构建通常不允许（或不建议）直接 import `webclient` 目录外的文件，所以 Web 侧保留了 `webclient/design-tokens/ui.json`。
> 原生端（iOS/Android）建议以仓库根的 `design-tokens/ui.json` 为准拷贝/读取；两份 JSON 内容应保持一致（后续建议写一个脚本同步，避免漂移）。

---

## 2. 这次 iOS 端做了哪些“可复用组件”

> 原则：优先做“轮子”（组件），让后续新增更多设置项时不需要重复写样式。

### 2.1 iOS 设计 Token（对齐 Web 亮色）
- `Apple-app/Lanook/Lanook/Views/DesignSystem/LanookDesignTokens.swift`

包含：
- `background / card / muted / border / foreground / mutedForeground / checkGreen`
- `shadowColor / outerShadow* / innerShadow*`
- `cardRadius / listRadius`

经验：
- Token 的命名建议保持语义（L0/L1/L2/Border/TextPrimary/TextSecondary），不要用“灰1灰2”这种不可维护的名字。
- 先对齐亮色，后续再扩展 warm/dark（建议用同一份 token 结构增加 theme 维度）。

### 2.2 设置卡片容器（外层/内层同一套“皮肤”，不同用法）
- `Apple-app/Lanook/Lanook/Views/DesignSystem/SettingsContainers.swift`

组件：
- `LanookCard(style: .outer / .inner)`

对应 Web：
- 外层块（SettingsGroup）与内层卡片（SettingsSecondaryCard）“皮肤一致”，区别在使用场景与阴影表现。

经验：
- 不要在各个设置模块里手写 `cornerRadius/shadow/background`，全部走容器组件，后续调整阴影/圆角只需要改一处。

### 2.3 分割线组件（避免系统 Divider 颜色跑偏）
- `Apple-app/Lanook/Lanook/Views/DesignSystem/LanookDivider.swift`

组件：
- `LanookDivider`（水平）
- `LanookVSeparator`（竖直）

踩坑记录：
- 之前把水平线误用在竖直分隔位置，导致图标区出现“横向一条线”。  
  解决：明确区分水平/竖直分割线组件，禁止混用。

### 2.4 设置行、面板与展开动画（复刻 Web 的手感）
- `Apple-app/Lanook/Lanook/Views/DesignSystem/SettingsRows.swift`

组件：
- `SettingsRowView`（对应 Web 的 SettingsRow：左侧图标条 + 文案 + 右侧区域）
- `SettingsPanel`（对应 Web 的 SettingsPanel）
- `SettingsExpand`（对应 Web 的 SettingsExpand）

展开/收起动画实现要点：
- Web 的参考：`webclient/components/settings/list-ui.tsx` 中 `SettingsExpand` 使用 framer-motion 走 `height: 0 <-> auto`。
- SwiftUI 默认 `transition` 容易出现“跳动”和“收起留白”。  
  本次做法：测量内容高度 + `frame(height:)` 动画（0 → contentHeight）+ `opacity` 同步动画。
- 关键细节：测量层必须放在 `overlay`，否则收起状态也会占布局导致空白。

经验：
- 这套 `SettingsExpand` 可以直接复用到所有“可展开设置块”。
- 动画参数（duration/ease）应统一，避免不同块展开手感不一致。

### 2.5 扁平选择列表（带勾选）
- `Apple-app/Lanook/Lanook/Views/DesignSystem/SelectableList.swift`

对应 Web：
- `webclient/components/ui/selectable-list.tsx`

经验：
- 勾选颜色用 token（`checkGreen`），不要用系统 `Color.green`（会有色偏/主题差异）。
- 按压态底色统一用 `muted`，而不是系统 `systemGray6`。

---

## 3. iOS 设置页复刻的业务层组件（示例）

### 3.1 “存储与任务 / Storage & Tasks”模块（可复用模板）
- `Apple-app/Lanook/Lanook/Views/Settings/StorageTasksSettingsBlock.swift`

结构与 Web Demo 对齐：
- 外层：`LanookCard(.outer)` + `SettingsRowView`（点击可展开/收起）
- 展开内容：`SettingsExpand` → `SettingsPanel`
- 内层：`LanookCard(.inner)`（文件索引服务卡片）
- 扁平列表：`SelectableListCard + SelectableListItem`
- 其它区块：占位 section（任务与进度、媒体路径管理）

额外修复（布局稳定性）：
- 顶部“文件索引服务”标题/描述在切换“实时/定时”时会 1/2 行抖动：  
  在该卡片内部用固定高度（两行高度）保证布局稳定。  
  这属于具体卡片内容排版，不是设计系统基础组件。

---

## 4. 给 Android 端的落地建议（确保三端一致）

### 4.1 建议先做“同名组件库”，再做页面

Android（Jetpack Compose）建议对应实现：
- `LanookTokens`（读取同款颜色/圆角/阴影）
- `LanookCard(outer/inner)`
- `LanookDivider` / `LanookVSeparator`
- `SettingsRow` / `SettingsPanel` / `SettingsExpand`
- `SelectableListItem` / `SelectableListCard`

页面层只做组合，不写视觉样式。

### 4.2 展开/收起动画对齐方式

Web：`height 0 ↔ auto` + `opacity`  
iOS：测量高度 + `animate frame(height)` + `opacity`  
Android：建议使用 Compose 的 `animateContentSize` 或 `AnimatedVisibility` + `expandVertically/shrinkVertically`（注意避免测量导致的跳动），并统一 duration/easing。

### 4.3 颜色一致性优先级

为了“肉眼一致”：
- Android/iOS 不要直接用系统默认背景/分割线/secondary text 色；
- 统一使用 Web 亮色 token（背景、卡片、muted、border、文字灰），否则会出现你看到的“肉眼不一致”。

---

## 5. 维护规则（后续新增设置项时请遵守）

1) 新增设置模块：必须复用 `SettingsRowView + SettingsExpand + SettingsPanel`（或 Android 对应实现）。  
2) 所有卡片外壳：必须复用 `LanookCard`（或 Android 对应实现），禁止手写 `shadow/cornerRadius/background`。  
3) 分割线：必须用 `LanookDivider/LanookVSeparator`（或 Android 对应实现），禁止使用系统默认 Divider/separator。  
4) 勾选列表：统一用 `SelectableListItem`（或 Android 对应实现），勾选颜色必须走 token。  
5) 布局抖动：优先通过“固定行高/固定两行高度”等方法保证稳定，再考虑更复杂的布局方案。

---

## 6. 文件索引（便于三端对照）

Web：
- `webclient/components/ui-demo-view.tsx`
- `webclient/components/ui-demo-storage-tasks.tsx`
- `webclient/components/settings/list-ui.tsx`
- `webclient/components/ui/selectable-list.tsx`
- `webclient/components/search/search-capsule.tsx`
- `webclient/app/globals.css`
- `design-tokens/ui.json`
- `webclient/design-tokens/ui.json`
- `webclient/lib/design-tokens.ts`

iOS：
- `Apple-app/Lanook/Lanook/Views/DesignSystem/LanookDesignTokens.swift`
- `Apple-app/Lanook/Lanook/Views/DesignSystem/SettingsContainers.swift`
- `Apple-app/Lanook/Lanook/Views/DesignSystem/SettingsRows.swift`
- `Apple-app/Lanook/Lanook/Views/DesignSystem/SelectableList.swift`
- `Apple-app/Lanook/Lanook/Views/DesignSystem/LanookDivider.swift`
- `Apple-app/Lanook/Lanook/Views/Settings/StorageTasksSettingsBlock.swift`

---

## 7. Web Demo 页面结构（原生端“对照尺”）

> 目的：Android/iOS 在实现组件时，除了看单个组件，还需要知道 Demo 页“组件摆放顺序与组合方式”，否则容易只做出单个控件但整体布局不一致。

Web Demo 页面入口：
- `webclient/components/ui-demo-view.tsx`

当前 Demo 页面从上到下分 3 个区域（section），建议原生端按同样顺序做一个 `DemoScreen` 方便逐项对照：

### 7.1 搜索相关（Search）

位置：Demo 页第一块（最上方）。

包含：
1) 独立搜索框（Standalone Input）
   - 组件：`SearchStandaloneInput`
   - 作用：验证“胶囊外壳 + 输入框”的填充色/边框/高度
2) 独立按钮（Standalone Button）
   - 组件：`SearchStandaloneButton`
   - 展示状态：
     - disabled（虚线描边版本：仅用于 Demo 对比）
     - disabled（文字版）
     - 普通按钮（箭头图标）
     - loading 2 秒后报错（用于验证 loading/错误提示时的交互感）
3) 组合搜索框（Capsule Input + Button）
   - 组件：`searchCapsuleWrapperClass` + `SearchCapsuleInput` + `SearchCapsuleButton`
   - 作用：验证“输入区 + 右侧按钮区”的分区层次与 hover/pressed 反馈

### 7.2 主题预览切换（Theme Preview Switch）

位置：Demo 页第二块（搜索相关下面）。

组件：
- `TabLikeButton`（多枚并排）

作用：
- 这是“面板切换按钮”的参考样式（Web 上用于各类 tab-like 切换）。
- 原生端可按同样风格做“分段切换/按钮组”，但 iOS/Android 是否复刻系统 Segment 控件由产品选择决定。

### 7.3 存储与任务（Storage & Tasks）

位置：Demo 页第三块。

内容：
- `StorageSettingsBlockDemo`（在 `webclient/components/ui-demo-storage-tasks.tsx`）

该 Demo 块展示了设置页的“标准组合方式”：
- 外层可展开设置块：`SettingsGroup` + `SettingsRow` + `SettingsExpand` + `SettingsPanel`
- 内层功能卡片：`SettingsSecondaryCard`
- 扁平勾选列表：`SelectableListCard + SelectableListItem`

原生端实现建议：
- iOS/Android 先把这套“外层可展开块 + 内层卡片 + 勾选列表”做成可复用模板，然后再扩展更多设置项（网络、媒体管理、安全等）。
