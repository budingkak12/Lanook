// Cross-platform design tokens for LANook UI.
// Source of truth JSON: /webclient/design-tokens/ui.json
// Android / iOS 可以直接读取这份 JSON（或复制一份到原生工程），实现同样的圆角、阴影、间距等。

import tokens from "../design-tokens/ui.json"

export type DesignTokens = typeof tokens

export const designTokens = tokens as DesignTokens

export default designTokens
