# A03 文档上下文与稳定绑定实施证据

任务：beeba626-ccf0-4071-bb39-af5d4b042ab9。本 worker 不修改云端状态。

## 本轮改动

- `src/ai/context/editorContext.ts`：请求时捕获并深冻结文档 session ID、内容 revision 指纹、尺寸、目标稳定 ID、有效锁定/可见图层树、按 scope 捕获选区、文档像素范围及目标坐标映射。所有输入来自文档空间，不读取缩放、画布旋转、CSS 或 devicePixelRatio。旋转图层按矩阵四角计算包围盒，空/越界范围拒绝；无 transform 为现有画布的文档空间 identity。
- `src/ai/context/editorContext.test.ts`：无目标、祖先锁定、无选区、深冻结、视图独立、文档空图层、旋转目标和画布外边界。
- `src/creation/ImageGeneration.tsx`：真实批处理和演示路径发起前捕获 context；校验失败走已有 message warning；context 跟随冻结的 AIOperation 保存到结果 provenance，不重新读取当前选择。
- `src/creation/ImageGeneration.test.tsx`：真实 fetch 契约请求尚未返回时切换目标和选区，结果仍记录原目标；编辑锁定目标不会发送网络请求。
- `src/state/editor.tsx`：仅本轮新增 type import、AIOperation 可选 context 字段、ImageGenerationProvider 传入 document.id，保留其余既有工作区修改。

## 验证

先运行新测试，缺少 editorContext 模块导致预期失败（exit 1）。随后实现并修复测试装配。

- `npm test -- --run src/ai/context/editorContext.test.ts src/creation/ImageGeneration.test.tsx src/document/documentWorkspace.test.ts src/document/projectFormat.test.ts`：4 files / 20 tests 全通过，exit 0。
- `npm run build`：通过，exit 0。保留既有 >500kB chunk 警告。
- `git diff --check -- src/ai/context/editorContext.ts src/ai/context/editorContext.test.ts src/creation/ImageGeneration.tsx src/creation/ImageGeneration.test.tsx`：通过，exit 0。
- 未运行全量（协调器另行串行执行以避免多全量争用）。未调用付费 API。

## 验收映射

1. `2b9befad-3123-492f-87f7-2477ca2bc431`：单元验证父组锁定和无图层、无选区；真实入口组件验证锁定阻止提交。
2. `99f6d9d9-c7e3-44c0-a5a1-5a6f51a724f7`：延迟 fetch 返回期间切换选择/选区，真实返回图像的 aiOperation.context.targetLayerId 保持原 ID；冻结树和 selection 不与 state 共享对象。既有 documentWorkspace 测试同时覆盖后台结果归属原文档及关闭后的忽略。
3. `3e981e71-0fe1-43b7-b147-64aed7d4bfac`：25%/400% view state 与旋转/平移不参与请求坐标，固定 2000×1000 文档选区得到相同 pixelBounds；目标自身90度旋转通过 layerMatrix四角得到正确AABB。实现没有读取devicePixelRatio。

## 支持边界与未声称能力

- preview 只提供最多1024边长的采样尺寸 metadata，不包含实际位图或声称已经降采样。当前真实链是文生图，不发送参考图，故本项不虚构参考像素输入；真实参考图/编辑模型接入属于独立 F23 任务。
- 内容 revision 是紧凑内容指纹，用于请求 provenance，并不是并发写入授权令牌；真正编辑结果的 revision 冲突策略在后续编辑/事务任务接入。
- 更正初轮理解：CanvasScene 的 children 实际嵌套在祖先 transform 内，因此坐标映射必须累计祖先物理像素矩阵。现已逐层复现 SVG 的 contentWidth/contentHeight、平移、旋转和翻转语义，再把 target 本地百分比映射到文档百分比。没有跨 checkout 修改 F05。


## 独立复核修复

初轮只映射目标 transform，遗漏祖先 SVG 继承，被独立审核指出后已修复。新增回归先失败（exit 1，实际SVG点与上下文映射差约244px），随后实现祖先矩阵累计。

- 两级组 + child 自身旋转 + 各层 content 尺寸不同，测试独立解析真实 CanvasScene 渲染的 SVG transform 字符串，对照3个位置点和最终AABB。
- 无显式 transform 的祖先 content 尺寸缩放也有独立回归测试。
- 最终专项4文件20测试通过；构建通过。
