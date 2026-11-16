# Photoshop 式文字图层工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文字工具创建独立文字图层，并支持点文字、段落文字、移动、缩放、旋转、直接编辑和文字属性同步。

**Architecture:** 保留 `CanvasTextObject` 作为可编辑文字数据，在 `Layer` 上增加 `kind` 与 `textObjectId` 关联。文字图层复用现有 `TransformDraft` 保存位置、尺寸和旋转；SVG 负责正式渲染，HTML 覆盖层只负责选中、编辑和控制点。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、SVG/CSS、现有 Editor reducer。

---

### Task 1: 文字数据与独立图层

**Files:**
- Modify: `src/canvas/TextObject.tsx`
- Modify: `src/state/editor.tsx`
- Modify: `src/canvas/CanvasScene.tsx`
- Test: `src/state/editor.text.test.ts`

- [x] 先写测试：文本创建应新增独立 `kind: text` 图层，图层删除/复制应同步文字对象。
- [x] 执行测试确认当前实现失败。
- [x] 增加文字图层标识、文本对象布局字段与 reducer 创建/更新/删除逻辑。
- [x] 执行测试确认通过。

### Task 2: 点文字与段落文字输入

**Files:**
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `src/canvas/TextObject.tsx`
- Test: `src/canvas/CanvasTextTool.test.tsx`

- [x] 先写测试：点击画布创建点文字，拖动创建段落文字框，文字工具再次点击已有文字进入编辑。
- [x] 执行测试确认失败。
- [x] 实现输入草稿、确认、取消和段落宽度。
- [x] 执行测试确认通过。

### Task 3: 文字选择与画布变换

**Files:**
- Modify: `src/canvas/TextObject.tsx`
- Modify: `src/canvas/CanvasViewport.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/canvas/CanvasTextTransform.test.tsx`

- [x] 先写测试：选择文字图层后可移动、缩放、旋转，并可用 Escape 取消草稿。
- [x] 执行测试确认失败。
- [x] 复用文字覆盖层控制点，加入文字选择框、移动、缩放、旋转。
- [x] 执行测试确认通过。

### Task 4: 文字属性面板

**Files:**
- Modify: `src/layers/PropertiesPanel.tsx`
- Modify: `src/components/ToolOptionsBar.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/layers/PropertiesPanel.text.test.tsx`

- [x] 先写测试：选择文字图层时显示文字内容、字体、字号、颜色、对齐和行高属性。
- [x] 执行测试确认失败。
- [x] 实现属性更新并保持画布与 SVG 导出同步。
- [x] 执行测试确认通过。

### Task 5: 全量回归与文档

**Files:**
- Modify: `docs/implementation/2026-11-14-text-tool.md`
- Test: all existing tests

- [x] 运行文字相关测试、全量 Vitest、`npm run build`、`git diff --check` 和 `vibeplan check`。
- [x] 记录当前仍未实现的高级排版能力，例如文字沿路径、OpenType 高级特性和多文字对象同层。
