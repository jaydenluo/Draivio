# 文字框下方空白维修

用户反馈：文字下方多出空白，控制框不贴合文字。

范围：文字对象的选中控制点、点文字行高、画布编辑输入框；段落文字保留用户设置的框高，不改变文档内容或其他工具。

根因：实际浏览器中旋转按钮和八个缩放按钮均为 static 定位，参与文字对象排版。120px 单字的文字行高约 168px，加上按钮行后对象高度约 338px；输入框还存在 2.5em 最小高度和默认两行。

计划：
- [x] 加入实际样式回归，先确认失败。
- [x] 控制点绝对定位，编辑框覆盖文字，不额外撑高；保留字体行距，避免中英文混排时裁切下伸字母。
- [x] 浏览器检查编辑与缩放；测试覆盖多行、段落文字。
- [x] 最终测试、构建、diff 和 Vibe Plan 检查。

状态：实现、浏览器复验和最终检查通过。本次为用户直接授权的维修，无对应的远程任务；不创建或批准无关任务。

## 改动文件

- `src/styles/theme.css`：旋转/缩放控制点绝对定位；编辑输入框覆盖内容，移除默认最小多行高度、背景和原生调整手柄；编辑时隐藏场景文字，避免重复显示；点文字不受 20px 最小宽度限制。
- `src/canvas/TextObject.tsx`：输入框默认一行，点文字输入框按内容框实际尺寸调整，避免 scrollHeight 的字体溢出额外撑高；字体参数变化时重新测量。
- `src/canvas/TextObject.layout.test.tsx`：加载实际 CSS 验证控制点不参与排版、编辑框不撑高、保留段落/多行行距，以及 scrollHeight 大于实际框高的回归。

## 验证记录

- RED：控制点 static、编辑框 static 的实际样式回归失败；随后输入框额外溢出测试实际为 144px、期望 120px，失败后修复。
- 浏览器：修复前 120px 文字控制框约 338px 高，控制点全部 static；最终选中框和输入框均为正常 168px 单行行框，控制点全部 absolute，没有额外按钮行。保留原有 1.4 行高，避免强行压成 1em 裁掉中英文混排字母下缘。
- 浏览器拖动角点：实际字号从 120px 改为约 99.584px，控制点仍在四周，输入正常。
- 预览：`docs/implementation/screenshots/2026-11-15-text-bounds.jpg`。
- `npx vitest run --maxWorkers=1 src/canvas/TextObject.layout.test.tsx src/canvas/TextObject.test.tsx src/canvas/CanvasTextTool.test.tsx src/canvas/CanvasTextTransform.test.tsx src/canvas/textTransformGeometry.test.ts src/canvas/CanvasScene.test.tsx src/canvas/CanvasLiveMovement.test.tsx src/canvas/CanvasDocumentText.test.tsx src/canvas/CanvasObjectTools.test.tsx src/canvas/CanvasViewport.test.tsx`：10 文件、73 项通过，退出码 0。
- `npm run build`：通过，退出码 0；现有包大小及无效动态导入提示仍存在。
- `git diff --check`、`vibeplan check`：通过，退出码 0。

剩余问题：本范围无已知阻断；文字框仍包含字体正常行距，段落文字保留用户指定高度，本轮未进行原生桌面打包验收。
