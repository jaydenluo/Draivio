# 画布外内容可见

来源：用户要求超出画布的文字继续可见。替代上一轮“编辑区也按画布边界裁切”的决定；保留不自动滚动、不改变背景和文档尺寸的要求。

设计：编辑工作区允许内容与控制点延伸到画布外，画布细边线标记输出范围；只在主工作区边缘裁切，面板不会被覆盖。SVG 场景与编辑层同时允许溢出，缩放、平移和旋转保持同一坐标系。导出副本显式恢复裁切，并使用原文档/裁剪尺寸。缩略图保持原有范围。

方案比较：只放开输入框会造成提交后文字消失；另加一套外部文字渲染会引入字体/遮罩不一致。采用原场景允许溢出，复用图层混合与蒙版，导出独立裁切。

任务：
- [x] 更新实际 CSS 和导出回归，确认先失败。
- [x] 放开场景/画布窗口溢出，增加边界线，导出显式裁切。
- [x] 浏览器验证输入、提交、其他工具状态、画布不漂移；运行测试/构建/检查。

实现与验证记录：
- `src/styles/theme.css`：画布窗口和 SVG 场景允许溢出；工作区边缘继续裁切，细边线标记输出范围。保留固定应用布局及禁止原生滚动的修复。
- `src/canvas/documentIO.ts`：只对导出克隆恢复隐藏溢出，不改变编辑场景。
- `src/canvas/TextObject.layout.test.tsx`、`src/canvas/documentIO.test.ts`：样式和导出回归先失败，修复后通过。
- `agent.md`：同步画布外可见、导出按边界裁切的交互约定。
- 相关 10 个测试文件共 78 项通过，退出码 0（TextObject.layout、documentIO、CanvasScene、CanvasTextTool、CanvasTextTransform、CanvasViewport、CanvasViewport.fit、AppShell、DocumentTabs、exportImage）。存在既有 jsdom Canvas getContext 提示。
- `npm run build` 通过，退出码 0。首次构建发现 `src/document/clippingMerge.test.tsx` 中状态参数被推断为空数组类型，改为显式 `EditorState` 类型后通过；该文件另行运行 3 项测试全部通过，退出码 0。此调整仅涉及测试类型。
- `git diff --check` 和 `vibeplan check` 通过，退出码 0。
- 浏览器实际验证：文字越过画布右边后仍显示；提交、在画布外点击编辑并追加文字、切换画笔后均保持可见，控制点也可见。画布位置及尺寸保持一致，窗口 scrollLeft/scrollTop 均为 0。
- 截图：`docs/implementation/screenshots/2026-11-15-visible-canvas-overflow.jpg`。

状态：实现和上述验证完成，待用户体验反馈。未验证原生桌面打包；构建仍有既有包体积和动态导入警告。未提交或推送代码。

范围内授权直接来自用户，无对应远程任务，不创建或批准其他任务。
