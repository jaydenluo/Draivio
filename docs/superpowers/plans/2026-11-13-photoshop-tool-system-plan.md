# Photoshop 式画布工具系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将 Draivio 的左侧工具栏升级为 Photoshop 式工具组系统，并一次性完成工具菜单、快捷键、选区、画笔/蒙版、裁剪/文字/导航四个阶段的前端交互基础。

**Architecture:** 用一个工具注册表描述工具组、子工具、快捷键和参数；`ToolRail` 只负责组入口，`ToolFlyout` 负责子工具选择，`ToolOptionsBar` 负责当前工具参数。画布交互拆成几何选择、笔触、路径、变换和导航模块，编辑器状态统一保存当前工具、选区、路径、画布对象和撤销快照。真实像素合成和 AI 服务通过接口接入，不改变工具交互。

**Tech Stack:** Tauri 2, React, TypeScript, Vitest, Testing Library, CSS。

---

### Task 1: 建立工具注册表和状态模型

**Files:**
- Create: `src/tools/toolRegistry.ts`
- Create: `src/tools/toolTypes.ts`
- Modify: `src/state/editor.tsx`
- Test: `src/tools/toolRegistry.test.ts`

- [x] **Step 1: 写失败测试**

覆盖工具组、默认工具、快捷键和组内循环：矩形/椭圆/自由套索/多边形套索/贝塞尔必须属于选区组；重复按 `M` 在选区子工具中循环。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/tools/toolRegistry.test.ts`

预期：因工具注册表和新状态接口尚未存在而失败。

- [x] **Step 3: 实现最小注册表**

定义 `ToolGroup`、`ToolVariant`、`ToolOption`、`ToolShortcut`；将现有工具迁移到九个工具组。编辑器状态增加 `activeToolGroup`、`activeToolId`、`recentToolByGroup`、`toolOptions`，保留旧 `activeTool` 的兼容映射直到组件迁移完成。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/tools/toolRegistry.test.ts`

预期：注册表测试全部通过。

- [x] **Step 5: 提交**

提交信息：`feat: add grouped photoshop-style tool registry`

### Task 2: 实现工具组入口和右下角菜单

**Files:**
- Create: `src/components/ToolFlyout.tsx`
- Modify: `src/components/ToolRail.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/components/ToolRail.test.tsx`

- [x] **Step 1: 写失败测试**

测试点击小三角打开子工具、点击子工具更新当前工具、按 `Escape` 关闭、长按约 250ms 打开、没有子工具的组不显示小三角。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/components/ToolRail.test.tsx`

预期：找不到工具组菜单和子工具选择行为。

- [x] **Step 3: 实现菜单组件**

`ToolFlyout` 使用锚点位置计算，默认向右展开，接近窗口边缘时翻转；点击外部和 `Escape` 关闭。`ToolRail` 由注册表生成组按钮，按钮右下角显示小三角，主点击激活最近工具，长按打开菜单。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/components/ToolRail.test.tsx`

预期：菜单交互测试全部通过。

- [x] **Step 5: 提交**

提交信息：`feat: add tool group flyouts`

### Task 3: 实现快捷键和临时工具

**Files:**
- Create: `src/tools/useToolShortcuts.ts`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/state/editor.tsx`
- Test: `src/tools/useToolShortcuts.test.tsx`

- [x] **Step 1: 写失败测试**

测试 `V/M/L/P/B/E/Q/C/T/I/H/Z/R` 切换工具，重复按组快捷键循环子工具，按住 `Space` 临时平移，`Escape` 关闭菜单和取消未提交操作。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/tools/useToolShortcuts.test.tsx`

预期：键盘事件不会改变工具状态。

- [x] **Step 3: 实现快捷键 Hook**

在 `AppShell` 注册全局 `keydown/keyup`；文本输入框、Composer 和账户输入框获得焦点时忽略工具快捷键。记录 Space 临时工具前的工具，松开后恢复。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/tools/useToolShortcuts.test.tsx`

预期：快捷键和临时工具测试通过。

- [x] **Step 5: 提交**

提交信息：`feat: add photoshop-style tool shortcuts`

### Task 4: 增加工具选项条

**Files:**
- Create: `src/components/ToolOptionsBar.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/state/editor.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/components/ToolOptionsBar.test.tsx`

- [x] **Step 1: 写失败测试**

测试切换矩形选区显示新建/添加/减去/相交、羽化和固定比例；切换画笔显示大小/硬度/不透明度；切换文字显示字体/字号；参数改变后保存在状态。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/components/ToolOptionsBar.test.tsx`

预期：当前界面没有工具选项条。

- [x] **Step 3: 实现选项条**

根据注册表渲染参数控件；将选项条放在画布顶部，不占用右侧图层面板；所有数值输入设置边界并提供键盘焦点。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/components/ToolOptionsBar.test.tsx`

预期：各工具参数测试通过。

- [x] **Step 5: 提交**

提交信息：`feat: add contextual tool options bar`

### Task 5: 完善选区几何和选区模式

**Files:**
- Create: `src/canvas/selectionGeometry.ts`
- Create: `src/canvas/SelectionOverlay.tsx`
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `src/state/editor.tsx`
- Test: `src/canvas/selectionGeometry.test.ts`
- Test: `src/canvas/SelectionOverlay.test.tsx`

- [x] **Step 1: 写失败测试**

覆盖矩形、椭圆、从中心绘制、Shift 锁定正方形、四种选区模式合并、羽化数值、反选、扩展和收缩；覆盖八个控制点和四条边的调整。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/canvas/selectionGeometry.test.ts src/canvas/SelectionOverlay.test.tsx`

预期：几何函数和独立选区覆盖层尚未存在。

- [x] **Step 3: 实现几何模块**

将选区计算从 `CanvasViewport.tsx` 移到纯函数模块；选择状态保存 `kind`、`mode`、`rect`、`path`、`feather` 和 `fixedRatio`。`SelectionOverlay` 负责控制点、边点、拖动和键盘微调。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/canvas/selectionGeometry.test.ts src/canvas/SelectionOverlay.test.tsx`

预期：选区几何和控制点测试通过。

- [x] **Step 5: 提交**

提交信息：`feat: add photoshop-style selection geometry`

### Task 6: 实现套索、多边形套索和贝塞尔路径

**Files:**
- Create: `src/canvas/PathOverlay.tsx`
- Create: `src/canvas/pathGeometry.ts`
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `src/state/editor.tsx`
- Test: `src/canvas/pathGeometry.test.ts`
- Test: `src/canvas/PathOverlay.test.tsx`

- [x] **Step 1: 写失败测试**

测试自由套索记录点并闭合、多边形套索按 Enter 闭合、贝塞尔锚点和控制柄移动、闭合路径转选区。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/canvas/pathGeometry.test.ts src/canvas/PathOverlay.test.tsx`

预期：路径状态和闭合操作不存在。

- [x] **Step 3: 实现路径交互**

保存路径点和锚点控制柄；自由套索松开时闭合，多边形和贝塞尔由 Enter 或点击起点提交。路径提交后显示“转为选区”和“创建蒙版”操作。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/canvas/pathGeometry.test.ts src/canvas/PathOverlay.test.tsx`

预期：路径工具测试通过。

- [x] **Step 5: 提交**

提交信息：`feat: add lasso and bezier path selection`

### Task 7: 完善画笔、橡皮、修复和蒙版

**Files:**
- Create: `src/canvas/BrushEngine.ts`
- Create: `src/canvas/MaskOverlay.tsx`
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `src/state/editor.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/canvas/BrushEngine.test.ts`
- Test: `src/canvas/MaskOverlay.test.tsx`

- [x] **Step 1: 写失败测试**

测试画笔大小/硬度/不透明度、连续笔触、橡皮擦命中笔触、蒙版红色预览、反转/清空/应用蒙版和绘制操作撤销。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/canvas/BrushEngine.test.ts src/canvas/MaskOverlay.test.tsx`

预期：笔触和蒙版选项尚未独立实现。

- [x] **Step 3: 实现笔触和蒙版模块**

将当前 `CanvasViewport` 中的笔触分支拆出；笔触保存点、大小、颜色、不透明度和硬度；蒙版保存为独立对象，默认以红色覆盖显示，应用动作生成可撤销快照。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/canvas/BrushEngine.test.ts src/canvas/MaskOverlay.test.tsx`

预期：画笔、橡皮和蒙版测试通过。

- [x] **Step 5: 提交**

提交信息：`feat: add brush eraser and mask interactions`

### Task 8: 实现裁剪、变换、文字、形状、取色和导航

**Files:**
- Create: `src/canvas/TransformOverlay.tsx`
- Create: `src/canvas/TextObject.tsx`
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `src/components/ToolOptionsBar.tsx`
- Modify: `src/state/editor.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/canvas/TransformOverlay.test.tsx`
- Test: `src/canvas/CanvasObjectTools.test.tsx`

- [x] **Step 1: 写失败测试**

测试裁剪比例和确认/取消、自由变换八点控制、旋转/翻转、文字创建和编辑、形状创建、取色更新颜色、平移/缩放/旋转画布。

- [x] **Step 2: 运行测试确认失败**

运行：`npm test -- --run src/canvas/TransformOverlay.test.tsx src/canvas/CanvasObjectTools.test.tsx`

预期：这些工具尚未具备独立对象和提交状态。

- [x] **Step 3: 实现对象工具**

裁剪和变换使用独立覆盖层，Enter 提交、Escape 取消；文字和形状保存为画布对象；导航只修改画布视图变换，不改变网页缩放。

- [x] **Step 4: 运行测试确认通过**

运行：`npm test -- --run src/canvas/TransformOverlay.test.tsx src/canvas/CanvasObjectTools.test.tsx`

预期：对象工具和导航测试通过。

- [x] **Step 5: 提交**

提交信息：`feat: add transform text shape and navigation tools`

### Task 9: 统一撤销栈、文档和整体验收

**Files:**
- Modify: `src/state/editor.tsx`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `README.md`
- Modify: `agent.md`
- Test: `src/app/InteractionAcceptance.test.tsx`

- [x] **Step 1: 写失败验收测试**

串联验证：选择工具组子工具、绘制选区、调整控制点、创建蒙版、添加笔触、移动画布、撤销/重做、切换 Composer、折叠历史区；确认输入框聚焦时快捷键不抢夺输入。

- [x] **Step 2: 运行验收测试确认失败**

运行：`npm test -- --run src/app/InteractionAcceptance.test.tsx`

预期：至少有一项跨模块交互未接通。

- [x] **Step 3: 统一状态和边界**

确保所有画布对象操作进入同一撤销栈，工具菜单和选项条不会遮挡 Composer；在 1020px 最小窗口宽度下菜单仍可操作；补充 reduced-motion 和键盘焦点样式。

- [x] **Step 4: 运行完整验证**

运行：`npm test -- --run && npm run build && (cd src-tauri && cargo check)`

预期：所有测试通过，Vite 构建成功，Rust 检查成功。

- [x] **Step 5: 更新文档并提交**

将实际已实现的快捷键和工具行为同步到 `agent.md`、`README.md`，提交信息：`feat: complete photoshop-style canvas tools`


## 实施结果

四阶段画布工具已在同一前端工作区实现并完成回归验证。真实云端模型调用、计费和 Tauri SQLite Key 存储保留为 provider/原生层接入点。


## 目标工作流 100% 完成计划

原四阶段工具系统完成的是交互基础。要达到“AI 图片创作、手绘、选区、局部编辑 100% 可用”，继续执行 [AI 图片工作流 100% 完成计划](./2026-11-13-ai-image-workflow-100-percent-plan.md)，对应任务清单见 [AI 图片工作流 100% 任务清单](../tasks/2026-11-13-ai-image-workflow-100-percent-tasks.md)。该计划补齐真实栅格引擎、压力笔、像素选区、局部编辑、图层历史、云/API Key 闭环、本地项目和 Windows/macOS 验收。
