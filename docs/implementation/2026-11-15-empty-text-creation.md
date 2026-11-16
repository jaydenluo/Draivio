# 空白文字创建

用户要求：文字工具点击时不再预设「双击编辑文字」，没有输入内容时取消创建。

设计：新建使用局部空白草稿，点击创建点文字、拖动创建段落框；松手后聚焦空白输入框。失焦或确认时仅将非空白文字一次写入当前图层。空白、纯空格、输入后清空、Esc 及绘制取消均不留下对象或创建历史。已有文字继续原有编辑/取消规则。

原因：当前 CanvasViewport 在 pointerdown 直接派发 create-text-layer，占位对象提前进入文档；段落松手又产生一次更新，单次撤销会恢复占位内容。

计划：
- [x] 增加空白输入、取消、纯空白、一次创建/撤销和段落框回归测试，先复现失败。
- [x] 草稿改为输入结束才提交，清理占位文字及空编辑框布局，保留已有文字编辑。
- [x] 运行文字/画布相关测试、构建、diff 和 vibeplan check，更新结果。

状态：实现及验证通过。本次为用户直接授权的文字交互修改，没有绑定远程任务，不创建或批准其他任务。

## 改动文件

- `src/canvas/CanvasViewport.tsx`：删除预填内容；创建手势和编辑阶段均仅保存局部草稿，非空白内容确认后才派发 create-text-layer。点文字及段落文字均一次提交。
- `src/canvas/TextObject.tsx`：空白时不使用「文字」作为显示回退；编辑测量用不可见占位字符保持行高，输入值仍为空字符串。
- `src/styles/theme.css`：点文字空编辑框保留 1.5em 最小宽度，确保光标和输入可见。
- `src/canvas/CanvasTextTool.test.tsx`：覆盖空白输入、有效内容创建、单步撤销/重做、失焦、确认、Esc、纯空白、输入后清空、切换工具、段落手势取消、段落空编辑取消及已有文字编辑取消。
- `src/canvas/CanvasObjectTools.test.tsx`：创建文字撤销后应无文字对象，不再恢复旧占位文字。
- `agent.md`：记录空白草稿、不留下空对象和有效内容结束编辑后才创建的交互约定。

## 测试与验收

- RED：CanvasTextTool 新增回归中 9 项失败，证明旧逻辑仍预填且空操作留下对象；修复后对应场景通过。
- 首次并行运行 3 文件时，文字相关测试通过；另一个连续绘画测试超时（5 秒）。随后限制单工作进程重新运行相关用例，通过，未改变超时配置或画笔逻辑。
- `npx vitest run --maxWorkers=1 src/canvas/CanvasTextTool.test.tsx src/canvas/CanvasObjectTools.test.tsx src/canvas/TextObject.test.tsx src/canvas/CanvasTextTransform.test.tsx src/canvas/CanvasScene.test.tsx src/canvas/CanvasDocumentText.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/CanvasLiveMovement.test.tsx src/state/editor.text.test.ts src/layers/PropertiesPanel.text.test.tsx`：10 文件、59 项通过，退出码 0。
- `npm run build`：通过，退出码 0；现有包体积及重复动态导入提示仍存在。
- `git diff --check`：通过，退出码 0。
- `vibeplan check`：通过，退出码 0。
- 独立浏览器标签页：点击进入输入框，其值为空，焦点正确，编辑框显示宽度约 24px；未输入时点击选择工具，编辑框消失，文字交互对象及 SVG 文字对象数量均为 0。未刷新用户原有编辑页。

剩余问题：本次范围内无已知阻断问题；未进行原生桌面打包验收。
