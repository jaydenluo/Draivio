# Draivio AI 图片工作流 100% 完成计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans。按任务顺序执行，每个任务完成测试和验收后再勾选。

**目标：** 围绕 AI 图片创作、手绘、选区和局部编辑，把 Draivio 从交互原型推进到可以稳定完成一张图片创作的桌面软件。

**完成定义：** 用户可以导入图片，使用手绘和选区完成局部修改，调用云端或用户 API Key 进行文生图、图生图、局部重绘、抠图、放大和修复，查看生成结果并加入图层，保存/恢复本地项目；所有关键操作可撤销、可重做、可导出。

**当前基线：** 工具组、快捷键、选区几何、路径、SVG 画布对象、基础图层、颜色选择器和 AI Composer 界面已完成。真实栅格笔刷、压力感应、精确局部编辑、完整图层合成、服务调用、项目持久化和跨平台稳定性仍需完成。

**架构：** 保留 React/Tauri UI 和工具注册表；新增栅格文档引擎、选择/蒙版数据层、AI provider 适配层和本地项目存储层。SVG 继续承担矢量对象和交互覆盖层，栅格引擎承担图片、笔刷、橡皮、局部编辑和导出，二者通过统一文档坐标和撤销事务连接。

**技术栈：** Tauri 2、React、TypeScript、Canvas 2D/OffscreenCanvas、Web Worker、Vitest、Testing Library、Rust SQLite/文件 API。

---

## 里程碑与依赖

| 里程碑 | 目标 | 依赖 |
| --- | --- | --- |
| M1 栅格基础 | 真实画笔、橡皮、蒙版、压力和撤销 | 无 |
| M2 选区与局部编辑 | 选区精修、抠图、修复、仿制、局部重绘输入 | M1 |
| M3 文档与图层 | 非破坏图层、合成、保存、导出和恢复 | M1、M2 |
| M4 AI 闭环 | 云/API Key 的生成、编辑、结果采用和失败恢复 | M2、M3 |
| M5 稳定发布 | 性能、跨平台、可访问性和回归验收 | M1–M4 |

---

### Task 1：统一文档模型和能力矩阵

**文件：** Create docs/superpowers/specs/2026-11-13-ai-image-workflow-capability-matrix.md；Create src/document/documentTypes.ts；Modify src/state/editor.tsx；Test src/document/documentTypes.test.ts。

- [ ] 定义 RasterDocument、RasterLayer、SelectionMask、EditTransaction、DocumentAsset，统一 0–100 文档坐标与像素坐标转换。
- [ ] 为每个工具标记真实完成状态：可用、需要云服务、仅演示；UI 不再把未接服务显示成已完成。
- [ ] 测试导入尺寸、图层尺寸、选区坐标和撤销快照的一致性。
- [ ] 验收：所有工具通过同一文档接口读取当前图层、选区和蒙版。

运行：npx vitest run src/document/documentTypes.test.ts

### Task 2：真实栅格合成与导出核心

**文件：** Create src/engine/raster/RasterSurface.ts、src/engine/raster/composite.ts、src/engine/raster/rasterWorker.ts；Modify src/canvas/CanvasScene.tsx、src/canvas/CanvasViewport.tsx；Test src/engine/raster/composite.test.ts。

- [ ] 用 Canvas 2D/OffscreenCanvas 保存图层像素，支持透明度、可见性、变换、裁剪和正常/正片叠底/滤色/叠加混合模式。
- [ ] SVG 对象和图片图层统一渲染为导出 surface，预览和导出使用相同合成顺序。
- [ ] 大于 2048×2048 的栅格操作移入 Worker，主线程接收进度、结果和错误。
- [ ] 验收：PNG 导出与画布预览的图层、蒙版、透明度和变换一致。

运行：npx vitest run src/engine/raster/composite.test.ts

### Task 3：完成手绘、压力、橡皮和笔刷稳定性

**文件：** Modify src/canvas/BrushEngine.ts、src/canvas/CanvasViewport.tsx、src/state/editor.tsx；Create src/canvas/pointerPressure.ts；Test src/canvas/BrushEngine.test.ts、src/canvas/pointerPressure.test.ts。

- [ ] 记录 PointerEvent 的 pressure、tiltX、tiltY；鼠标使用 0.5 默认压力，触控笔使用真实压力。
- [ ] 实现大小、硬度、不透明度、流量、平滑、间距和笔触端点；铅笔硬边，柔边笔透明度衰减。
- [ ] 橡皮擦以 alpha 擦除当前栅格层；背景橡皮擦按颜色容差擦除连续区域；仿制图章和涂抹作用于像素 surface。
- [ ] 一次 pointerdown/pointerup 只生成一条撤销事务，取消手势不写历史。
- [ ] 验收：鼠标、触控板和压力笔都能稳定绘制，快速拖动不丢线。

运行：npx vitest run src/canvas/BrushEngine.test.ts src/canvas/pointerPressure.test.ts

### Task 4：完成选区精修和蒙版数据层

**文件：** Modify src/canvas/selectionGeometry.ts、src/canvas/SelectionOverlay.tsx、src/state/editor.tsx；Create src/canvas/selectionRaster.ts；Test src/canvas/selectionRaster.test.ts、src/canvas/SelectionOverlay.test.tsx。

- [ ] 将矩形、椭圆、套索、多边形和贝塞尔路径转为真实像素 mask，支持抗锯齿、羽化、反选、扩展、收缩和四种布尔模式。
- [ ] 云端主体选择返回 mask 后可以用画笔增加、减去和边缘平滑。
- [ ] 八点缩放、边点调整、固定比例、Alt 中心创建、Shift 等比和键盘微调更新同一 mask。
- [ ] 验收：任何选区都能直接用于填充、删除、蒙版、局部重绘和导出。

运行：npx vitest run src/canvas/selectionRaster.test.ts src/canvas/SelectionOverlay.test.tsx

### Task 5：完成局部编辑工具

**文件：** Create src/canvas/localEdits.ts；Modify src/canvas/CanvasViewport.tsx、src/canvas/cloudToolServices.ts、src/state/editor.tsx；Test src/canvas/localEdits.test.ts、src/canvas/ToolInteraction.test.tsx。

- [ ] 填充和渐变只作用于当前选区或蒙版范围，未选区时作用于当前图层。
- [ ] 背景橡皮擦、仿制图章、涂抹、修复、抠图返回带透明通道的栅格结果，并保留原图层可撤销。
- [ ] 云端主体抠图和修复接口统一接收图片、选区 mask、提示词和 provider。
- [ ] 统一处理超时、取消、无 API Key、额度不足和服务不可用。
- [ ] 验收：选区外像素保持不变；失败操作不会破坏当前图层。

运行：npx vitest run src/canvas/localEdits.test.ts src/canvas/ToolInteraction.test.tsx

### Task 6：完善图层、蒙版、历史和非破坏编辑

**文件：** Modify src/layers/LayersPanel.tsx、src/layers/PropertiesPanel.tsx、src/state/editor.tsx、src/canvas/CanvasScene.tsx；Create src/state/historyTransactions.ts；Test src/state/historyTransactions.test.ts、src/state/layerWorkspace.test.ts。

- [ ] 支持图层组、折叠、拖拽排序、锁定、隐藏、多选、剪贴蒙版和图层蒙版。
- [ ] 调整层使用亮度、对比度、饱和度、色温、锐化、模糊、阴影和高光参数，应用前后都能撤销。
- [ ] 所有像素编辑、选区变化、图层操作和 AI 结果采用都使用事务历史；连续笔触只产生一条历史记录。
- [ ] 验收：图层顺序、蒙版、调整参数和历史状态可在面板切换后保持一致。

运行：npx vitest run src/state/historyTransactions.test.ts src/state/layerWorkspace.test.ts

### Task 7：打通云端/API Key 的 AI 创作闭环

**文件：** Modify src/creation/ImageGeneration.tsx、src/creation/imageProtocols.ts、src/creation/openaiImages.ts、src/creation/serviceConnections.ts、src/creation/AIComposer.tsx、src/state/editor.tsx；Test src/creation/ImageGeneration.test.tsx、src/creation/imageProtocols.test.ts、src/creation/serviceConnections.test.ts。

- [ ] 统一支持文生图、图生图、局部重绘、抠图、放大和修复六类操作。
- [ ] 云服务和用户 API Key 使用同一 provider 接口，支持配置、测试连接、额度/错误展示和取消请求。
- [ ] 使用真实响应图片，不再生成演示占位图；结果保存到本地文件并显示在结果面板。
- [ ] 结果支持预览、收藏、新图层、替换当前图层、下载和重试。
- [ ] 验收：不配置 Key 时能用 Draivio 云服务；配置自己的 Key 后能切换 provider 并完成六类操作。

运行：npx vitest run src/creation/ImageGeneration.test.tsx src/creation/imageProtocols.test.ts src/creation/serviceConnections.test.ts

### Task 8：完成本地项目、图片存储和导出

**文件：** Modify src-tauri/src/lib.rs、src-tauri/src/service_connections.rs、src/state/editor.tsx；Create src-tauri/src/project_files.rs、src/document/documentIO.ts；Test src/canvas/documentIO.test.ts。

- [ ] 用户 API Key 继续使用 SQLite 明文保存，支持查看、编辑、删除和连接测试。
- [ ] 生成图片、导入图片和缩略图只保存到用户本地应用数据目录，数据库保存路径和元数据。
- [ ] 实现 .draivio 项目包，包含文档 JSON、图层、蒙版、历史摘要、图片资源和 AI 请求参数。
- [ ] 支持 PNG、JPG、WebP 导出；保存失败、无权限和资源缺失给出明确提示。
- [ ] 验收：关闭应用后重新打开项目，画布、图层、蒙版、AI 结果和最近编辑状态完整恢复。

运行：npx vitest run src/canvas/documentIO.test.ts
运行：cd src-tauri && cargo check

### Task 9：完成 Photoshop 式交互和可访问性

**文件：** Modify src/tools/useToolShortcuts.ts、src/components/ToolRail.tsx、src/components/ToolOptionsBar.tsx、src/canvas/CanvasViewport.tsx、src/styles/theme.css；Test src/tools/useToolShortcuts.test.tsx、src/components/ButtonAudit.test.tsx。

- [ ] 完成 V/M/L/P/B/E/Q/C/T/I/H/Z/R、Space 临时平移、Cmd/Ctrl 撤销重做、Cmd/Ctrl 缩放和 Cmd/Ctrl+0 适应画布。
- [ ] 所有小三角、浮层、数字输入、颜色面板和控制点支持键盘焦点、Escape 关闭和中文 aria-label。
- [ ] 双指缩放、Ctrl/Cmd 滚轮、画布拖动只影响画布 transform。
- [ ] 工具不可用时禁用按钮并显示原因；长操作显示进度，可取消且不丢失当前文档。
- [ ] 验收：仅使用键盘可以完成工具选择、参数修改、选区调整、AI 提交和结果采用。

运行：npx vitest run src/tools/useToolShortcuts.test.tsx src/components/ButtonAudit.test.tsx

### Task 10：性能、跨平台和发布验收

**文件：** Create docs/qa/ai-image-workflow-acceptance.md、src/qa/workflowAcceptance.test.tsx；Modify src-tauri/tauri.conf.json、README.md。

- [ ] 为 Windows 和 macOS 准备导入、手绘、选区、局部编辑、AI 生成、保存、重启恢复和导出的验收流程。
- [ ] 记录 2048×2048 和 4096×4096 文档的首屏时间、笔刷延迟、AI 等待和内存占用；大图操作超过阈值时降级预览分辨率。
- [ ] 检查窗口缩放、触控板手势、系统字体、文件权限、SQLite 初始化和升级迁移。
- [ ] README 增加开发运行、provider 配置、项目保存位置、已知限制和验收命令。
- [ ] 验收命令全部通过：npx vitest run、npm run build、cd src-tauri && cargo check；Windows/macOS 手工清单全部勾选。

## 100% 完成门槛

只有同时满足以下条件，才把“AI 图片创作、手绘、选区、局部编辑 100%”标记为完成：

- 六类 AI 操作使用真实 provider 响应，并能取消、重试、采用和撤销。
- 鼠标和触控笔都能完成连续手绘、橡皮、蒙版和局部编辑。
- 所有选区都能转为像素 mask，并能用于填充、删除、蒙版和局部重绘。
- 图层、蒙版、调整、历史、项目保存和图片导出可 round-trip。
- 失败请求不会破坏当前文档，所有长操作可见进度并可取消。
- 全量自动测试、前端构建、Rust 检查以及 Windows/macOS 手工验收均通过。

