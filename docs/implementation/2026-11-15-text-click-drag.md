# 文字单击编辑与拖动移动

用户要求：创建后的文字单击直接编辑，按住拖动移动位置。

设计：文字工具和选择工具中的现有文字对象都使用同一规则；鼠标释放后，无拖动的 click 进入编辑，移动超过 3 个屏幕像素才开始实体预览，松手一次提交。拖动、取消、缩放和旋转后的 click 不进入编辑。输入框内保留光标定位、文字选择和输入行为。新文字继续空白草稿，未输入不创建。

根因：CanvasViewport 仅在文字工具给 editOnClick=true；文字工具拖动未选图层的对象也受 allowMoveOnSelect 限制。位移判定按画布百分比过小，会将单击轻微抖动误判成移动。

计划：
- [x] 增加选择工具单击编辑、跨图层首次拖动、拖动后 click、小幅抖动和下一次单击回归。
- [x] 统一现有文字编辑/移动入口，修正拖动阈值和取消后的点击，保留文字输入和变换控件。
- [x] 相关测试、构建、diff、Vibe Plan 检查与浏览器验证，记录结果。

状态：实现和验证通过。用户直接授权的交互调整，没有对应远程任务，不创建/批准其他任务。

## 改动文件

- `src/canvas/CanvasViewport.tsx`：文字/选择工具的现有文字对象均启用单击编辑和首次拖动移动，不再要求先选中该图层。
- `src/canvas/TextObject.tsx`：按屏幕距离 3px 区分移动和点击，小幅抖动不写位移；取消移动后抑制随后 click；只允许主键开始变换。
- `src/canvas/CanvasTextTool.test.tsx`：新创建并撤销/重做后的文字单击编辑、选择工具编辑唯一对象、首次跨图层拖动、移动后的 click、不移动的轻微抖动、取消后的 click 不进入编辑。
- `src/canvas/TextObject.test.tsx`：变换手柄单击不进入输入。
- `src/canvas/CanvasTextTransform.test.tsx`：以按下/释放的选择状态测试控制点，避免把已改为编辑的 click 当作仅选择。
- `agent.md`：记录统一单击编辑与拖动移动约定。

## 验证

- RED：修改前新增/更新用例中 4 项失败，覆盖选择工具单击无编辑、微动误判以及未选中图层拖动失败。
- `npx vitest run --maxWorkers=1 src/canvas/CanvasTextTool.test.tsx src/canvas/TextObject.test.tsx src/canvas/CanvasTextTransform.test.tsx src/canvas/textTransformGeometry.test.ts src/canvas/CanvasObjectTools.test.tsx src/canvas/CanvasLiveMovement.test.tsx src/canvas/CanvasViewport.test.tsx src/canvas/CanvasDocumentText.test.tsx`：8 文件、60 项通过，退出码 0。
- `npm run build`：通过，退出码 0；现有包体积和动态导入提示仍在。
- `git diff --check`：通过，退出码 0。
- `vibeplan check`：通过，退出码 0。
- 独立浏览器页新建文字，在选择工具下单击立即出现相同内容的输入框；Esc 退出后直接拖动，实际 SVG x 从 97.664 变为 156.762，拖动结束输入框数为 0；再次单击立即恢复输入。未刷新用户已有编辑页。

剩余问题：本范围无已知阻断；原生桌面未打包验收。输入框内拖动仍用于选择文本，不抢占系统编辑操作。
