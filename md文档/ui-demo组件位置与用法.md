# UI Demo（`/ui-demo`）组件位置与用法

本文档用于说明本项目里 `http://localhost:3000/ui-demo` 页面展示的组件，各自对应的源码位置，以及在业务页面中的推荐用法（以 Web 前端为主）。

## 入口与页面结构

- 路由入口：`webclient/app/ui-demo/page.tsx`
  - 使用 `StandardSettingsPage` 包一层统一的设置页壳（标题栏、右侧返回按钮等）。
- 页面内容：`webclient/components/ui-demo-view.tsx`
  - 汇总展示多个“可复用 UI 组件”的效果与用法。
- 存储/任务 Demo：`webclient/components/ui-demo-storage-tasks.tsx`
  - 演示 Settings 体系的“外层块 + 二级卡片 + 扁平列表”组合方式。

## 组件索引（按 ui-demo 页面出现顺序）

### 1) 搜索相关组件（Search Capsule 系列）

- 代码位置：`webclient/components/search/search-capsule.tsx`
- 组件列表：
  - `SearchStandaloneInput`：独立搜索输入框（仅输入）。
  - `SearchStandaloneButton`：独立按钮（外观与独立搜索框一致，可图标/文字）。
  - `SearchCapsuleInput` + `SearchCapsuleButton`：组合搜索框（输入 + 按钮）。
  - `searchCapsuleWrapperClass`：组合/独立外壳统一样式 class。
- 推荐用法：
  - 独立按钮（常用于“下一步/确定/知道了”等轻量操作）：
    - `import { SearchStandaloneButton } from "@/components/search/search-capsule"`
  - 组合搜索框（输入 + 放大镜）：
    - `import { SearchCapsuleInput, SearchCapsuleButton, searchCapsuleWrapperClass } from "@/components/search/search-capsule"`

### 2) 主题预览切换

- Tab-like 按钮：
  - 代码位置：`webclient/components/ui/tab-like-button.tsx`
  - 使用：`import { TabLikeButton } from "@/components/ui/tab-like-button"`
- Switch：
  - 代码位置：`webclient/components/ui/switch.tsx`
  - 使用：`import { Switch } from "@/components/ui/switch"`
- 页面里主题切换逻辑（仅 Demo）：`webclient/components/ui-demo-view.tsx`
  - 使用 `next-themes`：`useTheme()`（这里是 Demo 示例，不要求业务里强绑定）。

### 3) 存储与任务（Settings 体系）

- Demo 组合：`webclient/components/ui-demo-storage-tasks.tsx`
- Settings 相关组件（外层块/行/展开/卡片/面板）：
  - 代码位置：`webclient/components/settings/list-ui.tsx`
  - 常用导入：
    - `import { SettingsGroup, SettingsPanel, SettingsRow, SettingsExpand, SettingsSecondaryCard } from "@/components/settings/list-ui"`
- 扁平可选列表（Selectable List）
  - 代码位置：`webclient/components/ui/selectable-list.tsx`
  - 使用：
    - `import { SelectableListCard, SelectableListItem } from "@/components/ui/selectable-list"`
  - 推荐：用于“单选/多选的设置项列表”，让选中态与交互风格统一。

补充：也可用于“展示型字段（非输入框）”的统一样式（例如设置页里 IP/端口/完整地址这种只读信息），通过 `showCheck={false}` + `right` 放图标实现“点击整行复制”等交互。

### 4) 基础 Button（仅 ui-demo 顶部返回按钮用到）

- 代码位置：`webclient/components/ui/button.tsx`
- 使用：`import { Button } from "@/components/ui/button"`
- 说明：这是通用 Button（shadcn 风格封装）。若页面希望与“搜索框胶囊 UI”保持一致，优先用 `SearchStandaloneButton`。

### 5) 备注提示块（Info Note）与内嵌小块（Inset Card）

这两类是近期在设置页里大量出现、但最初没有在 `/ui-demo` 页面明确列出的“规范组件”，用于避免开发时随手写 `border/bg/padding` 导致风格不一致。

- 备注提示块 `InfoNote`
  - 代码位置：`webclient/components/ui/info-note.tsx`
  - 适用场景：
    - 说明/备注/提示/注意事项（例如：“不会移动/删除你的文件”）
    - 高风险操作提示（例如：重置媒体库会清空 DB）
  - 使用：
    - `import { InfoNote } from "@/components/ui/info-note"`
  - 约定：
    - **短描述（1 行）**：直接用 `InfoNote` children 即可。
    - **有标题**：传 `title`，需要强调时用 `variant="warning"|"danger"`。

- 内嵌小块 `InsetCard`
  - 代码位置：`webclient/components/ui/inset-card.tsx`
  - 适用场景：
    - `SettingsSecondaryCard` 内部的二级分组容器（例如：任务与进度里分成“媒体索引进度 / 资产处理进度”）
    - “资产处理进度”里每个 artifact 的小块（缩略图/向量/标签/人脸），避免各处写法不同
  - 使用：
    - `import { InsetCard } from "@/components/ui/inset-card"`
  - 约定：
    - `variant="muted"`：默认分组背景（更像“块”）。
    - `variant="surface"`：更像“小卡片”的子块（背景更接近 `bg-card`）。

## 在业务页面里如何选择用哪个按钮？

- 想要“设置页同款胶囊外观”的按钮：用 `SearchStandaloneButton`
  - 适合：初始化流程底部按钮、弹窗确认按钮、轻量操作按钮。
- 想要通用的按钮样式（表单/工具栏/页面按钮）：用 `Button`
  - 适合：常规页面按钮、导航/返回、非胶囊风格区域。

## 为什么有的备注文字没包裹，有的又被包裹？

核心区别不是“能不能显示”，而是**语义与层级**：

- **不包裹（纯文本）**：它属于某个标题/控件的“紧邻描述”，通常就在组件内部 padding 区里（例如标题下面的 1 行说明）。这种描述不需要独立视觉容器，只要 `text-xs text-muted-foreground` 即可。
- **包裹（InfoNote / InsetCard）**：它是“独立的一段提示/注意事项”或“内层继续分组的块”，需要被用户明显识别为一段独立内容，并且在多个页面复用时保持一致外观。

建议统一规范（以后照做就不会纠结）：

1. **标题下的一行说明**：用纯文本（不包裹）。
2. **可被跳过但建议阅读的提示/备注**：用 `InfoNote`。
3. **需要在同一个内层盒子里再分组**：用 `InsetCard`。
4. **一整块功能模块**（包含标题/说明/列表/按钮）：用 `SettingsSecondaryCard`。
