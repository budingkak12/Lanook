# 主题系统使用指南

## 🎯 项目主题系统概述

本项目实现了完整的主题切换系统，支持：
- **亮色主题** 🌞：参考test文件夹配置，纯白背景深色文字
- **暗色主题** 🌙：保持原有风格，深灰色背景白色文字
- **跟随系统** 💻：自动匹配操作系统主题设置

主题切换按钮位于页面右上角，用户选择会自动保存到localStorage。

## 🎨 主题变量系统

### CSS变量命名规范

- `--background`: 页面背景色
- `--foreground`: 主要文字颜色
- `--card`: 卡片/容器背景色
- `--card-foreground`: 卡片内文字颜色
- `--primary`: 主要操作按钮背景色
- `--primary-foreground`: 主要操作按钮文字颜色
- `--secondary`: 次要操作按钮背景色
- `--secondary-foreground`: 次要操作按钮文字颜色
- `--muted`: 静音/辅助背景色
- `--muted-foreground`: 次要文字颜色
- `--accent`: 强调色
- `--accent-foreground`: 强调色文字颜色
- `--border`: 边框颜色
- `--input`: 输入框背景色
- `--ring`: 焦点环颜色

### Tailwind CSS类名

所有CSS变量都有对应的Tailwind类名：
- `bg-background` → `var(--background)`
- `text-foreground` → `var(--foreground)`
- `bg-card` → `var(--card)`
- `text-card-foreground` → `var(--card-foreground)`
- `bg-primary` → `var(--primary)`
- `text-primary-foreground` → `var(--primary-foreground)`
- 等等...

## 🔧 组件开发指南

### 1. 按钮组件 (Button)

#### ✅ 正确的使用方式

```tsx
// 主要按钮 - 根据主题自动变色
<Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
  主要操作
</Button>

// 次要按钮
<Button variant="secondary" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
  次要操作
</Button>

// 危险按钮
<Button variant="destructive" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
  危险操作
</Button>

// 轮廓按钮
<Button variant="outline" className="border-border hover:bg-accent text-foreground">
  轮廓按钮
</Button>
```

#### ❌ 错误的使用方式

```tsx
// 不要硬编码颜色
<Button className="bg-white text-black"> // ❌
<Button className="bg-gray-100 text-gray-900"> // ❌
<Button style={{ backgroundColor: 'white' }}> // ❌
```

### 2. 卡片/容器组件

#### ✅ 正确的使用方式

```tsx
<div className="bg-card border border-border rounded-lg p-4">
  <h3 className="text-card-foreground font-medium">标题</h3>
  <p className="text-muted-foreground">描述文字</p>
</div>

// 带透明度的容器
<div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-4">
  内容
</div>
```

#### ❌ 错误的使用方式

```tsx
<div className="bg-white border border-gray-200"> // ❌
<div className="bg-gray-50 border border-gray-300"> // ❌
<div style={{ backgroundColor: 'white' }}> // ❌
```

### 3. 输入框组件

#### ✅ 正确的使用方式

```tsx
<input
  className="bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
  placeholder="请输入..."
/>
```

### 4. 文字样式

#### ✅ 正确的使用方式

```tsx
<h1 className="text-foreground">主标题</h1>
<p className="text-muted-foreground">次要文字</p>
<span className="text-accent-foreground">强调文字</span>
```

### 5. 悬停和焦点效果

#### ✅ 正确的使用方式

```tsx
// 悬停效果
<div className="bg-card hover:bg-card/80 transition-colors">
  悬停变深/变浅
</div>

// 焦点效果
<button className="ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2">
  按钮
</button>
```

## 📋 实际应用示例

### 示例1：数据卡片

```tsx
function DataCard({ title, value, description }) {
  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-medium text-card-foreground mb-2">{title}</h3>
      <p className="text-2xl font-bold text-primary mb-1">{value}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
```

### 示例2：操作按钮组

```tsx
function ActionButtons() {
  return (
    <div className="flex gap-3">
      <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
        确认
      </Button>
      <Button variant="secondary" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
        取消
      </Button>
      <Button variant="outline" className="border-border hover:bg-accent text-foreground">
        其他选项
      </Button>
    </div>
  )
}
```

### 示例3：表单输入

```tsx
function FormInput({ label, value, onChange, placeholder }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
```

## 🎨 特殊效果

### 毛玻璃效果

```tsx
<div className="bg-card/30 backdrop-blur-sm border border-border/50 rounded-lg p-4">
  毛玻璃容器
</div>
```

### 渐变效果

```tsx
<div className="bg-gradient-to-r from-primary/20 to-secondary/20 border border-border rounded-lg p-4">
  渐变背景
</div>
```

## ⚠️ 常见错误和解决方案

### 错误1：硬编码颜色

```tsx
// ❌ 错误
<div className="bg-white text-black">
<button className="bg-gray-100 hover:bg-gray-200">

// ✅ 正确
<div className="bg-card text-foreground">
<button className="bg-secondary hover:bg-secondary/80">
```

### 错误2：使用特定的灰度值

```tsx
// ❌ 错误
<div className="bg-gray-50 border-gray-200 text-gray-900">
<span className="text-gray-500">

// ✅ 正确
<div className="bg-card border-border text-foreground">
<span className="text-muted-foreground">
```

### 错误3：内联样式

```tsx
// ❌ 错误
<div style={{ backgroundColor: 'white', color: 'black' }}>

// ✅ 正确
<div className="bg-card text-foreground">
```

## 🔍 调试技巧

### 1. 使用浏览器开发者工具

在开发者工具中检查元素，确保使用的是CSS变量而不是硬编码值：
- 应该看到 `var(--card)` 而不是 `rgb(255, 255, 255)`
- 应该看到 `var(--foreground)` 而不是 `rgb(0, 0, 0)`

### 2. 主题切换测试

确保你的组件在主题切换时正确响应：
- 点击右上角的主题切换按钮
- 检查组件颜色是否正确变化
- 确保没有硬编码的颜色残留

### 3. 对比度检查

确保文字在背景上有足够的对比度：
- 亮色主题：深色文字在浅色背景上
- 暗色主题：浅色文字在深色背景上

## 📚 参考资源

### 当前主题配置

查看 `app/globals.css` 了解完整的主题变量定义：
- 亮色主题 `:root` 变量
- 暗色主题 `.dark` 变量
- OKLCH颜色空间的使用

### 常用组件

参考项目中已有的组件：
- `components/language-selector.tsx` - 语言选择器
- `components/theme-toggle.tsx` - 主题切换器
- `components/step-navigation.tsx` - 步骤导航

## 🚀 开发最佳实践

1. **永远不要硬编码颜色值！** 始终使用CSS变量和主题类名
2. **保持一致性**：相似的组件使用相同的主题类名
3. **测试两种主题**：确保在亮色和暗色主题下都显示正常
4. **响应式设计**：使用主题系统不影响响应式布局
5. **可访问性**：确保足够的颜色对比度

### 🔍 快速参考

如果你不确定该用哪个变量：
- **主要按钮**：`bg-primary text-primary-foreground`
- **次要按钮**：`bg-secondary text-secondary-foreground`
- **卡片容器**：`bg-card text-card-foreground`
- **页面背景**：`bg-background text-foreground`
- **次要文字**：`text-muted-foreground`
- **边框**：`border-border`

### 📖 查看现有组件

参考项目中的现有组件：
- `components/language-selector.tsx` - 语言选择按钮
- `components/theme-toggle.tsx` - 主题切换器
- `components/step-navigation.tsx` - 步骤导航
- `app/page.tsx` - 主页面中的下一步按钮

---

**记住：开发新页面时，首先参考现有组件，然后使用正确的主题类名，避免任何硬编码颜色！**