# 长文字导致画布背景移位维修

用户要求：文字变大或变长只影响文字，超出画布边界正常裁切，不能挤压或改变其他内容。

范围：画布裁切容器、文字编辑聚焦；不改变文字内容、文档尺寸或图层变换。不绑定或修改其他远程任务。

## 排错证据

独立浏览器页，500×625 文档，180px 点文字。粘贴长文字后重新编辑，到末尾继续输入：`.canvas-crop-window.scrollLeft` 从 0 变为 4113.3335，背景 SVG 的屏幕 left 从 449.1195 变为 -1755.4329；文档和容器仍是 500×625。

根因：`overflow:hidden` 仍是可被聚焦/光标自动滚动的容器。浏览器为显示出界的输入光标，滚动了整个场景；并非文字真的改变了图片比例。

## 计划

- [x] 新增回归，确认画布裁切容器与文字聚焦策略失败。
- [x] 画布视口和文档裁切窗口改用不会滚动的裁切；文字聚焦不触发自动滚动。
- [x] 浏览器验证长文字末尾输入、多行向下出界、重新编辑和提交后背景稳定。
- [x] 执行相关测试、构建、diff 和 Vibe Plan 检查，记录证据。

状态：实现、浏览器复验和相关检查通过。

## 实现与改动文件

- `src/styles/theme.css`：画布和文档裁切窗口使用 overflow:clip；画布明确 min-height:0，保留网格容器原有可收缩高度；app-shell 固定于窗口，避免长文字光标触发根页面滚动后整个桌面工作区偏移。侧栏与其他面板的独立滚动保留。
- `src/canvas/TextObject.tsx`：聚焦时 preventScroll:true。
- `src/canvas/TextObject.layout.test.tsx`：加载实际 CSS，验证裁切、工作区定位、画布最小高度以及长文字编辑聚焦。
- `agent.md`：记录文字出界不改变其他内容的交互约定。

## 验证

- RED：裁切实际为 hidden、聚焦参数为空，新增回归失败；工作区 static 定位回归失败。修复后通过。
- 浏览器：超长单行文字 End 后继续输入，以及 8 行大文字 Ctrl+End 后输入，裁切容器 scrollLeft/scrollTop 均为 0。背景 SVG 在输入前、输入后、提交及重新编辑后保持 x=449.1195、y=190.4879、width=267.9763、height=334.9705（显示缩放约 53.6%）；工作区屏幕 x/y 均为 0。
- `npx vitest run --maxWorkers=1 src/canvas/TextObject.layout.test.tsx src/canvas/TextObject.test.tsx src/canvas/CanvasTextTool.test.tsx src/canvas/CanvasTextTransform.test.tsx src/canvas/textTransformGeometry.test.ts src/canvas/CanvasScene.test.tsx src/canvas/CanvasLiveMovement.test.tsx src/canvas/CanvasDocumentText.test.tsx src/canvas/CanvasObjectTools.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/CanvasViewport.fit.test.tsx src/components/AppShell.test.tsx src/document/DocumentTabs.test.tsx`：13 文件、92 项通过，退出码 0；测试环境有 3 条既有 Canvas getContext 未实现提示。
- `npm run build`：通过，退出码 0；既有包大小和无效动态导入警告保留。
- `git diff --check`、`vibeplan check`：通过，退出码 0。
- 截图：`docs/implementation/screenshots/2026-11-15-text-overflow.jpg`。

剩余问题：本维修范围无已知阻断；未进行原生桌面打包验收。
