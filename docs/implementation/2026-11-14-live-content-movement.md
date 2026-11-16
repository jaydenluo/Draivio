# 实体实时移动修复

用户授权：所有内容移动显示实体实时预览，保留松手一次提交及取消恢复。

分析：普通图层已有 SVG transform 预览；选择工具启用 SelectionOverlay 的移动热区，选区抢走鼠标事件而只移动边框。文字原先在独立 HTML 层预览，与 SVG 正文/图层合成分离。

计划：
- [x] 回归验证选择工具不被选区热区拦截，选区工具仍能调整边界。
- [x] 文字拖动/缩放/旋转直接预览 CanvasScene 中的对象，保留局部草稿及一次提交。
- [x] 验证普通图层、自由变换、多种内容同步跟随，取消不写历史。
- [x] 运行相关测试、生产构建、diff 检查和 vibeplan check，记录实际结果。

本轮仅维修用户反馈，不将其混入进行中的组合并/吸附远程任务，也不创建或批准远程任务。

## 修复内容与文件

- `src/canvas/CanvasViewport.tsx`：选择工具不再移动选区边框；按真实图层顺序命中内容，忽略空图层和不可编辑图层；向场景传递文字实时草稿。
- `src/canvas/CanvasScene.tsx`、`src/canvas/TextObject.tsx`、`src/styles/theme.css`：直接更新实际 SVG 文字，保留图层合成效果，避免 HTML 与 SVG 双份文字；松手一次提交，Esc / pointercancel 恢复。
- `src/canvas/TransformOverlay.tsx`：自由变换移动不再受选区的画布边界限制，满画布图层也可移动；裁剪边界仍保留原约束。
- `src/canvas/CanvasLiveMovement.test.tsx`：通过 Resvg 检查拖动途中图片、形状、笔触的实际像素，验证提交、撤销及取消。
- `src/canvas/CanvasObjectTools.test.tsx`、`src/canvas/CanvasTextTool.test.tsx`：覆盖选区热区、空蒙版误命中、SVG 文字实时位置及取消恢复。
- `src/canvas/CanvasTextTransform.test.tsx`、`src/canvas/SelectionOverlay.test.tsx`：修正与当前对象选择和选区工具职责一致的交互断言。

## 验证结果

- RED：实际像素测试复现自由变换拖动满画布图层不移动（3 通过、1 失败）；修复后对应 2 文件共 11 项通过。
- `npx vitest run src/canvas/CanvasLiveMovement.test.tsx src/canvas/CanvasObjectTools.test.tsx src/canvas/CanvasTextTool.test.tsx src/canvas/CanvasTextTransform.test.tsx src/canvas/SelectionOverlay.test.tsx src/canvas/CanvasScene.test.tsx src/canvas/TextObject.test.tsx src/canvas/TransformOverlay.test.tsx src/canvas/CanvasViewport.test.tsx`：9 文件、60 项通过，退出码 0。
- `npm run build`：通过，退出码 0；存在包体积与无效动态导入的非阻断提示。
- `git diff --check`：通过，退出码 0。
- `vibeplan check`：通过，退出码 0。
- 独立浏览器测试标签页验证：选择工具拖动示例海报后实际图片位置改变；自由变换尚未确认时实际海报随边框移动。未刷新用户已有编辑标签页。

状态：本轮维修已实现并验证。没有已知阻断问题；未对原生桌面应用打包或所有嵌套组/仿射变换组合做穷举验收。
