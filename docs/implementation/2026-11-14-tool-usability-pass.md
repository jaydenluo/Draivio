# 工具易用性第一轮优化

本轮目标是降低工具的发现和操作成本，沿用 Photoshop 式工具组与画布优先布局。

## 已调整

- 工具组右下角菜单按钮现在支持再次点击收起，`aria-expanded` 与三角方向同步；切换其他工具、点击外部和 Escape 的关闭行为保持不变。
- 选择工具不再只显示“请使用移动工具”的提示。点击可编辑图层会选中它，拖动可直接移动图层；锁定、隐藏图层会被跳过，移动结果进入撤销栈并给出反馈。
- 工具选项栏为画笔增加 4、12、24、48px 常用尺寸按钮，仍保留精确数字输入、拖动调节、滚轮和键盘调节。
- 选择、移动、缩放、旋转工具补充就近操作提示；缩放工具可在选项栏直接缩小、放大和适应画布，旋转工具可直接逆/顺时针旋转 15°或重置。
- 放宽选择/移动工具对选区显示层的处理，允许在选区区域操作图层；选区控制点和路径控制点仍优先处理自身手势。

## 验证

- `npx vitest run src/components/ToolRail.test.tsx src/components/ToolOptionsBar.test.tsx src/canvas/ToolInteraction.test.tsx src/canvas/CanvasViewport.test.tsx --exclude '.worktrees/**'`：20 项通过。
- 新增菜单收起和画笔预设测试后，`npx vitest run src/components/ToolRail.test.tsx src/components/ToolOptionsBar.test.tsx src/canvas/ToolInteraction.test.tsx --exclude '.worktrees/**'`：21 项通过。
- `npx vitest run --exclude '.worktrees/**'`：86 文件、357 项通过。
- `npm run build`：TypeScript 与 Vite 构建通过，保留现有大包提示。
- `git diff --check` 与 `vibeplan check`：通过。

## 仍需逐个确认

本轮属于通用易用性修整，未宣称 39 个工具的像素级行为全部达到 Photoshop 级别。主体选择、修复画笔、部分云端增强能力仍依赖服务配置；选区内图层命中目前按图层变换边界判断，后续可增加透明像素命中测试。用户继续指出具体工具后，按单工具建立复现、设计和回归测试。
