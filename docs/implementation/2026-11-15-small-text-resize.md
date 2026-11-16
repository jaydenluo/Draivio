# 小文字缩放维修

用户反馈：较小文字有时不能通过控制点拖动调整字号，较大文字较容易。

授权范围：修复文字缩放，不变更其他工具或远程任务状态。

已复现：独立浏览器标签页创建 24px 点文字，右下角向左拖约 30 屏幕像素，实际 SVG 字号保持 24。原因：角点使用两个轴缩放比例的最大值，未变化的轴使缩小比例保持 1；点文字使用存储的预设宽高而非实际显示宽高，造成缩放不跟手。

计划：
- [x] 新增小字号、单轴缩小、实际点文字尺寸、固定对角和旋转文字回归测试。
- [x] 以实际文字框为缩放基准，修正单轴拖动缩小，保持角点等比缩放；段落边点继续调整文本框，点文字边点调整字号。
- [x] 验证实际 SVG 文字实时更新、提交、撤销及取消，浏览器复验。
- [x] 运行相关测试、构建、diff 与 Vibe Plan 检查，记录结果及剩余问题。

状态：维修已实现、测试及浏览器复验通过。此反馈没有绑定的远程任务，不混入现有组合并/吸附任务，不创建或批准远程任务。

## 改动文件

- `src/canvas/TextObject.tsx`：按 DOM 的实际局部尺寸开始缩放，调用统一几何函数，控制框旋转原点与实际 SVG 一致；段落交互框使用相同换行结果；手柄悬停提示区分缩字号和调文本框。
- `src/canvas/textTransformGeometry.ts`：以变化较大的轴计算正负缩放，修复水平/垂直单轴缩小无效；等比缩放保持对角位置，支持文字旋转方向，点文字边点缩字号，段落边点改框宽高。
- `src/text/paragraphLayout.ts`、`src/canvas/CanvasScene.tsx`：提取现有 SVG 换行逻辑供文字控制框复用，避免窄文本框多行文字与命中高度不符。
- `src/styles/theme.css`：去除点文字 20px 最小宽度，避免小文字缩小后控制框宽度停住。
- `src/canvas/textTransformGeometry.test.ts`、`src/canvas/TextObject.test.tsx`、`src/canvas/CanvasTextTransform.test.tsx`：几何、真实测量接线及实际 SVG 字号预览/提交/撤销回归。

## 验证证据

- RED：`CanvasTextTransform.test.tsx` 新增缩小测试实际字号仍为 24，期望 12；段落交互换行测试实际无换行而失败。修复后均通过。
- `npx vitest run src/canvas/textTransformGeometry.test.ts src/canvas/CanvasTextTransform.test.tsx src/canvas/TextObject.test.tsx src/canvas/CanvasTextTool.test.tsx src/canvas/CanvasScene.test.tsx src/canvas/CanvasLiveMovement.test.tsx src/canvas/CanvasDocumentText.test.tsx src/canvas/CanvasViewport.test.tsx`：8 文件、47 项通过，退出码 0。包含现有文字移动 Esc / pointercancel 取消恢复回归。
- 增加手柄文字提示后，`npx vitest run src/canvas/TextObject.test.tsx`：8 项通过，退出码 0。
- `npm run build`：通过，退出码 0；现有包体积和静态/动态重复导入提示仍存在。
- `git diff --check`：通过，退出码 0。
- `vibeplan check`：通过，退出码 0。
- 独立浏览器标签页：修复前 24px 点文字角点向左拖 30 屏幕像素，字号不变；修复后在约 68% 画布缩放下，12px 点文字通过角点向内拖到 8.306px，再向外拖到 18.533px，SVG 和可见文字同时变化。

剩余边界：本次未做原生桌面打包验收或所有父图层变换组合穷举；段落仍沿用既有按平均字宽换行的方案，不代表已实现完整专业文字排版引擎。
