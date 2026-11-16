# AI 编辑能力基线（A01）

日期：2026-11-13。任务：`3fe3accf-0bfd-40bb-873d-01e9c02f6626`。这是当前脏工作区的源码与离线测试审计；并非功能实现或发布验收。并行修改可能改变后续结果。

## 证据与边界

真实 = 已存在下述限定行为；模拟 = 展示/别名/演示没有实现名称所承诺的完整行为；缺失 = 无生产实现或服务绑定。真实不代表已逐工具完成浏览器像素验收。图标、预设、假图片、mock fetch/Image/Canvas 和成功文案均不能证明真实模型或最终导出行为。

本次运行完整现有测试与构建，追踪全部工具到处理器、reducer、渲染和项目字段。没有逐个工具执行真实浏览器操作，没有真实服务调用，也没有生成前后图。因此 A01“逐项执行并记录真实像素”的人工端到端部分仍待补证，不能据此宣布全部验收完成。

## 实际检查

| 命令 | 退出码 | 结果 | 日志 |
|---|---:|---|---|
| `npm test -- --run` | 1 | 70 文件中 1 失败、69 通过；284 测试中 1 失败、283 通过 | `/tmp/draivio-ai-baseline-tests.log` |
| `npm run build` | 0 | TypeScript + Vite，96 模块，构建成功 | `/tmp/draivio-ai-baseline-build.log` |
| `vibeplan check` | 未执行 | 父代理负责统一工作流检查 | — |

失败：`src/canvas/ToolInteraction.test.tsx:30`，`canvas tools perform visible actions on the canvas` 找不到 `已取色 #dd806d`。该测试 mock 取色函数；不能推导底层取色像素算法失败，也不能在未排查前归因。未修改源代码或掩盖失败。后续定向复现通过，详见文末调查；原全量失败仍保留。

## 操作 → 状态 → 渲染 → 保存/导出

- **entry**：src/tools/toolRegistry.ts -> ToolRail/ToolOptionsBar -> CanvasViewport pointer/keyboard handlers
- **state**：src/state/editor.tsx reducer -> commit snapshot (30 entries) -> undo/redo
- **render**：CanvasScene -> BrushScene/MaskDefinitions/SVG shapes+text; SVG CSS filter adjustments
- **pixel**：rasterTools/rasterBrush/selectionRaster; rasterize-layer replaces source and clears layer masks/objects/transform
- **compositor**：src/engine/raster/composite.ts -> RasterSurface/rasterWorker wrappers and unit tests; no connection from viewport/export to these wrappers found; current scene/export uses SVG
- **project**：projectFormat v2 materializes sources into assets; restores editable fields; history undo stacks deliberately not persisted
- **export**：TopBar -> serializeEditorSvg -> Blob image/svg+xml; not raster compositor

文档提交通常经 `commit` 保存完整编辑快照，最多 30 次；工具选择和导航不是作品历史。项目 v2 保留 source、对象、蒙版、调整、裁剪、选区与 AI 结果，但不保存 undo/redo 栈及视图偏移/旋转/缩放。保存重开后的可编辑性与撤销历史连续性必须分开判断。

## 已暴露工具清单

注册表共 39 个工具，逐项机器可读证据见同名 JSON。以下每行均在 `CanvasViewport.tsx` 分派到 `editor.tsx`；具体 reducer actions、schema 字段、测试路径、证据边界及已有任务 UUID 均在 JSON 内，避免把组级测试当成每个工具的像素覆盖。

| 工具 ID | 状态 | 实际行为/边界 | 关联缺口 |
|---|---|---|---|
| `select` | 模拟 | Canvas click only posts “已选择当前图层”; no object/layer hit test. Existing selection overlay can move a selection. | F05, A04 |
| `move` | 真实 | Drag previews and commits selected layer transform; no automatic hit selection. | F05, A04 |
| `selection` | 真实 | Rectangle selection drag alias; changes selection geometry, not image pixels. | F10, A16 |
| `rectangle-select` | 真实 | Rectangle geometry plus combination modes/feather; raster mask primitive tested. | F10, A16 |
| `ellipse-select` | 真实 | Ellipse geometry plus combination modes/feather; browser export edge pixels unverified. | F10, A16 |
| `lasso-select` | 真实 | Freehand path closes on pointer up and commits irregular selection. | F10, A16 |
| `polygon-select` | 真实 | Anchors close with Enter/double click; explicit conversion commits selection. | F10, A16 |
| `bezier-select` | 真实 | Bezier anchors/handles and conversion to selection/mask; not a retained vector object. | F10, A16 |
| `magic-wand` | 真实 | Rasterizes scene, four-connected tolerance flood, converts mask to geometry. | F10, A16 |
| `subject-select` | 缺失 | Only injected selectSubject callback; no production configuration caller found. | F09, A16 |
| `brush` | 真实 | Imported untransformed image uses paintBrushStroke -> PNG source; otherwise SVG stroke object. | A37 |
| `pencil` | 真实 | Brush with hardness 100 and smoothing 0; same raster/vector branches. | A37 |
| `gradient-brush` | 模拟 | Brush group fallback creates ordinary paint stroke; no per-stroke gradient behavior. | A37 |
| `brush-line` | 真实 | Two-point straight stroke; raster branch or SVG BrushScene. | A37 |
| `soft-brush` | 真实 | Brush hardness forced 0; raster branch or SVG soft brush. | A37 |
| `smudge` | 真实 | Local smudge pixel primitive carries sampled color; SVG->canvas boundary mocked in tests. | A37 |
| `eraser` | 真实 | Imported untransformed image reduces alpha; SVG eraser masks preceding layer content. | F19, A37 |
| `background-eraser` | 真实 | Erases connected seed-color region by tolerance; not semantic background removal. | F19, A37 |
| `healing` | 缺失 | Injected heal callback only; empty production service registry reports not configured. | F19, A37 |
| `clone-stamp` | 真实 | Alt-click source then fixed-offset sampling from source snapshot; pure pixel tests. | F19, A37 |
| `mask` | 真实 | Layer mask strokes preview red; apply-mask activates luminance mask in scene/export. | F10, A16 |
| `mask-quick` | 真实 | Alias to mask brush, not a separately implemented quick-mask conversion workflow. | F10, A16 |
| `mask-gradient` | 真实 | Two-endpoint luminance gradient; preview then explicit apply. | F10, A16 |
| `mask-subject` | 缺失 | Same unconfigured selectSubject seam; only routes returned selection to mask. | F09, A16 |
| `crop` | 真实 | Non-destructive cropRect changes visible window and SVG viewBox; original canvas dimensions retained. | F04, A14 |
| `perspective-crop` | 真实 | Projective bilinear/premultiplied-alpha warp to PNG; reducer currently records document-sized content metadata. | F04, A14 |
| `transform` | 真实 | Selected-layer rectangle/rotation/flips; draft separate until Enter/apply; Escape cancels. | F04, A14 |
| `text` | 真实 | Editable multi-line SVG text object; basic font/size/weight/alignment; no rich paragraph/style ranges. | F14, F22, A37 |
| `shape` | 真实 | Filled rectangle object. | F14, F22, A37 |
| `shape-ellipse` | 真实 | Filled ellipse object. | F14, F22, A37 |
| `shape-line` | 真实 | Stroked line object. | F14, F22, A37 |
| `shape-arrow` | 真实 | Line plus geometric arrowhead. | F14, F22, A37 |
| `pen` | 模拟 | Reuses temporary Bezier selection path; converts to selection/mask, no persistent vector path/boolean shape. | F14, F22, A37 |
| `picker` | 真实 | Scene raster color sample; pure sample pixels pass, UI integration suite currently fails notice expectation. | A37 |
| `fill` | 真实 | Whole selected region/layer color fill; not click-contiguous paint bucket; raster branch else SVG shape. | A37 |
| `gradient-fill` | 真实 | SVG linear gradient shape with optional selection mask. | A37 |
| `pan` | 真实 | View offset only; Space shortcut supports temporary navigation; no document pixels/history. | A35 |
| `zoom` | 真实 | View zoom click/Alt-click, Ctrl wheel and pinch; no image resampling. | A35 |
| `rotate` | 真实 | View rotation only, drag/click and explicit controls; export intentionally unrotated. | A35 |

## 其余对外能力

- **adjustments**（simulated）：实际渲染只读取 brightness/contrast/saturation/temperature/blur；sharpness/shadows/highlights 仅存状态。temperature 为 sepia+hue-rotate 近似，不是真正白平衡。 关联 R, F11, F12, F13, A13, A15。
- **export**（real）：SVG serialization only; crop viewBox; overlays removed; remote hrefs not embedded by export 关联 F03。
- **project**（real）：v2 JSON asset table; data/HTTP images materialized; legacy v1 import; undo stacks and view preferences excluded; native/file-picker writes, download-only fallback cannot confirm durable write 关联 F01, F02。
- **ai-generation**（real）：OpenAI-compatible/Volcengine text-to-image request path and ImageBatch; no real-service call made; outputs auto-adopt into layers 关联 R, F23, A17, A18。
- **ai-editing**（missing）：Real source rejects edit mode; no reference image/mask editing request; cloud is 900ms demo placeholder only (source absent; current reducer status loading) 关联 F23, F24, F25, A17, A19。
- **ai-command-planning**（missing）：No natural-language structured plan/validated tool execution registry found in inspected src; toolRegistry only display definitions 关联 A02, A03, A04, A05, A07, A08, A09。

当前 AI 真实文生图结果 `append-ai-result` 会直接添加正式图层并标记 adopted；并未实现候选先隔离再采用。默认云端使用 900ms 定时器产生无 source 的占位层/结果（最近读取状态为 loading），不证明真实生成或图片编辑。`AIResult.test.ts` 的 legacy complete 操作验证元数据与撤销，不能证明图像返回。

## 已知缺口与已有任务

- **K01**：No complete per-tool manual pixel/history/save/export execution evidence; A01 procedural coverage remains partial（A01, A32, A35）。
- **K02**：Layer locks not checked in commit-brush-stroke/upsert-text/add-shape/commit-mask/rasterize-layer and pointer handler; ancestor lock not enforced there（R, F05, A04, A05）。
- **K03**：Async raster/cloud callbacks capture selected layer/state with no document ID/version guard; selection-to-mask binds current reducer selection target（A03, A05, F26）。
- **K04**：SVG layer extraction retains document background and layer CSS filters/opacity; rasterized result retains layer adjustments/opacity, risking double application; browser pixel test needed（F03, F04, A04, A32）。
- **K05**：Group rows/metadata do not establish hierarchical render/transform/lock semantics; CanvasScene renders flat reversed visible layers（F05, F06）。
- **K06**：Export may retain remote image hrefs and system-font dependencies; SVG download does not guarantee offline pixel parity（F03, F14, F31）。
- **K07**：Full suite fails picker notice integration; root cause not established or repaired by this audit（A01, A35）。

`composite.test.ts`、`rasterBrush.test.ts`、`rasterTools.test.ts` 中纯像素数组检查可证明算法的限定输入输出；`CanvasScene.test.tsx` 等验证 SVG/DOM/style，`PropertiesPanel.pixels.test.tsx` 实际验证尺寸显示而非调整后的 RGB。SVG→Image→Canvas 的 mock 测试只能证明调用契约，不能证明浏览器滤镜/混合/字体/透明边缘的最终像素。

## 首版与完整目标可执行检查

下列状态记录本次证据；未执行/阻塞不是通过。手工步骤以 `npm run dev` 打开应用后执行，固定本地 64×64 RGBA 色卡/灰阶及非方形透明 PNG；每步留存输入、输出、参数、解码像素差、项目文件和历史结果。真实模型检查需另行授权与记录费用，不自动运行。

### G01 · first · failed

命令/入口：`npm test -- --run`。


通过条件：0 failed tests。
本次观察：1 failed | 283 passed; ToolInteraction.test.tsx:30 cannot find 已取色 #dd806d。

### G02 · first · passed

命令/入口：`npm run build`。


通过条件：TypeScript and Vite exit 0。
本次观察：exit 0; 96 modules。

### G03 · first · not_run

命令/入口：`npm run dev`。

- Import a local 64x64 RGBA color-card PNG; use 8px red brush, eraser and an ellipse selection on separate fresh copies.
- Decode before/after exported SVG in an independent browser rasterizer; compare RGBA arrays. Assert outside selection unchanged, eraser alpha falls, source fixture retained.
- Undo once: pixels equal pre-gesture; redo: pixels equal post-gesture. Save .draivio, reopen offline; repeat pixel equality and object/schema inspection.

通过条件：Pixel/history/save/export equality evidence for brush and selection paths。

### G04 · first · blocked

命令/入口：`npm run dev`。

- Import gray ramp and six-color card. Set each of eight property adjustments individually to 40 then reset.
- Decode exported SVG and compare pixel arrays, then undo/redo and save/reopen. Identity at zero; document each actual response.

通过条件：No successful claim for a slider with unchanged pixels; temperature must disclose approximate CSS effect。
阻塞：sharpness/shadows/highlights not consumed by CanvasScene; no final pixel evidence。

### G05 · first · blocked

命令/入口：`npm run dev`。

- Invoke default cloud generate/edit; verify it is clearly demo/unavailable and cannot be adopted as actual image.
- Use locally provided image result in offline test; adopt/replace, verify original + undo, cancellation and failure do not alter artwork.
- With separately authorized real provider, record request/response image, model/parameters/cost and reference/mask semantics; do not use fixtures as service evidence.

通过条件：Candidates separate from formal layers; no source-less success; real edit capability only after actual image/reference request evidence。
阻塞：Default cloud demo; real source currently only text-to-image and auto-adopts; no real edit provider call。

### G06 · first · blocked

命令/入口：`npm run dev`。

- Import non-square transparent PNG; transform/flip/crop; save/reopen; download SVG.
- Independently decode output; assert dimensions, transparency, visible stack, no overlays, source pixels/transform/masks match viewport.
- Try advertised PNG/JPEG/WebP and selection/layer export; record unavailable until implemented.

通过条件：Explicit SVG-only current release; final raster formats decode correctly when added。
阻塞：TopBar exports SVG only; no independent browser output QA。

### G07 · full · not_run

命令/入口：`npm run dev`。

- Exercise every inventory row with a fresh local fixture and document before/after pixels, history, project reopen and export.
- Check layer and ancestor locks, transformed/non-default dimensions, cancellation, invalid inputs and stale document/version/target results.
- For missing/simulated rows, assert clear unavailable/demo UI and no artwork mutation; rerun after linked implementation tasks.

通过条件：Every exposed tool either verified as real with evidence or clearly unavailable; no misleading aliases。

### G08 · full · not_run

命令/入口：`Read each planFile in taskReferences and execute its verification/acceptance cases`。

- For every F01–F33, R and A02–A37 task, record independent current-cycle per-criterion evidence.
- Implement natural-language planning -> validated tool commands -> atomic preview/commit/rollback, persistent edit records and recipes, then execute fixed benchmark fixtures and authorized real-service evaluations separately.
- Cover RAW/high bit depth/ICC/CMYK/soft proof, multi-document/artboard, batch recovery, large-image memory, accessibility and platform checks before full-goal release.

通过条件：All required criteria reviewed; real service quality/cost separate from mocked contracts; no silent skips。

## 补充：暴露的历史与复制并不等于完整恢复/复制

- **历史选择：模拟。** `HistoryStrip.tsx` → `select-history` → `editor.tsx` 只赋值 `selectedHistoryId`。`ResultThumbnail.tsx` 渲染 tone CSS 色块和标签；CanvasScene 不读取该 ID，点击不会恢复图层、像素、选区或对象。compare 只是截取末四个元数据项。真实的 undo/redo 快照是另一条机制。schema 为 `history[].id/label/tone`、`selectedHistoryId`；项目编码排除 selectedHistoryId，restore-project 的白名单不恢复 history。导出不会因选中历史条目而改变。关联 **R (`92116dc7-a664-47f2-918e-8afa9d501a98`)、A29、A30**。原测试只证明历史折叠与快照 undo，不证明缩略图恢复。
- **图层复制：模拟（完整可编辑复制缺失）。** `LayersPanel.tsx` → `duplicate-layer` 只 shallow-copy Layer。CanvasScene 按 layerId 从 `brushStrokes`、`canvasTexts`、`canvasShapes`、`layerMasks` 与 `sceneOrder` 取内容；这些表没有复制/重映射。组的 children/groupId 仍指向原 ID，adjustments/transform 嵌套引用初始共享，selectedLayerIds 不同步。因此导入图片 source 副本可能看似正确，文字/形状/笔画/蒙版副本会缺内容，组副本没有独立子树。一次 commit 可撤销浅副本，不代表完整复制。保存/导出忠实保留这些不足。关联 **R (`92116dc7-a664-47f2-918e-8afa9d501a98`)、F05、A04、A37**。原 layerWorkspace duplication 测试只检查名称、解锁、顺序与删除；并行 R01 新增深复制测试未算入原审计运行结果。

### G09 · first · blocked：历史恢复回归

入口 `npm run dev`。先保存图像 A，再绘制/变换为 B，点击 A 的历史缩略图；对照完整文档状态与独立解码 SVG。必须恢复 A 并定义可撤销边界，或明确标为只选择历史标签。比较页必须用真实来源图。覆盖 undo/redo、清空、保存重开、缺失条目。当前仅设置 selectedHistoryId，不能宣布恢复/比较验收通过。

### G10 · first · blocked：独立完整复制回归

入口 `npm run dev`。在同一图层加入 source、笔画、文字、形状、已应用蒙版、变换和调整，复制后检查所有对象 ID、layerId、蒙版、sceneOrder。独立修改副本必须不影响原件；一次撤销/重做完整移除/恢复副本；保存重开和导出均一致。再复制嵌套组，确保所有 descendants/children/groupId 重映射，栈序和多选 ID 正确。当前 shallow-copy 无法满足。

## 取色失败的只读复现

按 systematic-debugging 技能追踪：CanvasViewport `sampleCanvasColor` → `set-brush-color` → reducer notice → TopBar `message.info` → MessageHost portal；当前代码中的字符串与测试期待完全一致。定向运行 `npm test -- --run src/canvas/ToolInteraction.test.tsx` **退出码 0，1 文件、4 测试全通过**，日志 `/tmp/draivio-ai-baseline-picker-focused.log`，总时长 1.42 秒。没有修改代码或测试。此结果不会覆盖原全量运行的退出码 1。

**根因尚未证实。** 失败未在定向运行复现；全量并行负载下默认 findByText 1 秒等待不足、以及并行源码修改导致观察快照不同，只能作为待验证假设。建议 R01 完成后固定工作区再跑全量；若仍失败，采集 picker mock 调用/返回、reducer notice 与 messageStore 边界数据定位。仅在证实是等待不足后调整有界等待，不能删断言或据此改取色像素算法。

## 任务引用

下表 F/R UUID 来自冻结 roadmap manifest，全部 37 个 A 系列 UUID 已从 `write-status.json.createdTaskIds` 回填。最新远端任务状态由父代理统一维护。

| 编号 | 已有任务 UUID | 标题 |
|---|---|---|
| F01 | 8e0e4c40-174e-4351-b7ff-9f41dc44f297 | 建立可恢复编辑状态的 Draivio 项目文件 |
| F02 | 6ed0827b-7695-4b62-a4c9-a32e9da456f0 | 自动保存、恢复记录与崩溃恢复 |
| F03 | 86334889-4f25-4c1d-8f34-afdb937b29fd | PNG、JPEG、WebP 与选区/图层导出 |
| F04 | 206ef3a1-378e-4dcd-8e49-1c95096aa733 | 画布尺寸、图像缩放与统一像素坐标 |
| F05 | fcb42afd-75ad-4118-9793-e0ed297b7935 | 组整体变换与图层合并 |
| F06 | fa00ba86-4507-4ae0-91c9-1bc405e94ede | 剪贴蒙版与完整常用混合模式 |
| F07 | c60979b3-31a2-4ecb-97c8-ca2c982120a6 | 对齐与等距分布 |
| F08 | 3dcae1cb-edf1-4148-96a9-1b883b5b520a | 标尺、参考线、网格与智能吸附 |
| F09 | 868741ae-597d-48af-a575-1201884a4e4b | 真实主体识别与背景移除 |
| F10 | e8e211d0-5b0e-4ec0-81d0-5d517fb8dab5 | 选择并遮住与蒙版边缘精修 |
| F11 | c94960da-5e9a-45dc-b6d6-37a9d0c4281a | 直方图、曝光与准确白平衡 |
| F12 | 5bf6994e-5c2d-46ab-a1b8-b439c6188ba2 | 曲线与色阶 |
| F13 | 46c5e27c-1f9c-4614-a45f-df13d499e74d | HSL、色彩平衡与调整预设 |
| F14 | 79956f5e-d48e-4ef3-90d9-575117f1a6d5 | 文本框、段落排版与局部文字样式 |
| F15 | 2f295f3e-dd37-4a5e-931e-f8a26b1ab663 | 可重编辑的图层效果 |
| F16 | d868e8c5-6ae1-4fda-90b8-f9e4cbc354af | 调整图层与局部调整蒙版 |
| F17 | 4a41be31-fad3-4251-9d3b-a323437c1739 | 智能对象与替换内容 |
| F18 | 5d6da8e9-4f92-447e-b8b4-ec0c9d8e2ecd | 智能滤镜与可重排处理链 |
| F19 | 35cf98fb-639a-49fd-873b-e5e26f0a1f7b | 污点修复、仿制与修补工具完整闭环 |
| F20 | c594f3eb-b5f9-4ce0-9944-eb5b53faf4e6 | 移除工具与内容识别填充 |
| F21 | 06c7705f-79d1-42da-8caa-0359f99fc1a2 | 减淡、加深与局部色调画笔 |
| F22 | 6bf0d14d-36db-491b-b99c-bbc19402af71 | 路径锚点编辑与形状布尔运算 |
| F23 | 1b230fe9-afb5-4be5-be5c-889397983034 | 真实参考图编辑与按模型显示参数 |
| F24 | 9bc057e9-6e10-4581-a2a5-44fd6e78ef4a | 选区生成填充与 AI 物体移除 |
| F25 | f3a699a2-6102-4617-8200-fb086bbd4008 | 扩图与画布外生成 |
| F26 | 7e930f74-07f8-41ae-aee5-50b6303446fb | 多文档标签与状态隔离 |
| F27 | 9d2d2685-1fcb-46c3-b64b-948695a20176 | 多画板与同设计多尺寸版本 |
| F28 | 379fb04f-26a5-4cae-9de3-f2d4aa8f2f0d | 批量缩放、导出、水印与调整预设 |
| F29 | cb50a00b-2792-40b1-8398-1a9c3533b8bd | RAW 解码与基础显影 |
| F30 | 3e2fb3da-b5ff-4961-8610-0fab97a8cb34 | 16 位与 32 位浮点高精度处理 |
| F31 | e91f3f81-16dd-423c-b482-0218e5a5d7b7 | ICC 色彩管理与配置文件转换 |
| F32 | 27fab054-0c10-4bd6-bb31-16ad514b8a88 | CMYK 文档与印刷导出 |
| F33 | f37f0db2-51ec-4f83-92ef-fe41a45914c2 | 软打样、色域警告与印刷检查 |
| R | 92116dc7-a664-47f2-918e-8afa9d501a98 | 升级图片处理右侧工作区与 AI 结果工作流 |
| A01 | 3fe3accf-0bfd-40bb-873d-01e9c02f6626 | 编辑能力基线、缺口与 AI 工具覆盖矩阵 |
| A02 | e3ac5120-efde-4c7f-b053-a7a0826eaff5 | AI 工具协议、参数校验与注册表 |
| A03 | beeba626-ccf0-4071-bb39-af5d4b042ab9 | 文档上下文、作用范围与稳定对象绑定 |
| A04 | c0258b81-7048-4424-a77f-965dfff0ea7f | 基础编辑工具的统一命令适配 |
| A05 | 1787311c-549f-49d5-8f86-22577f8f2437 | AI 多步事务、预检、回滚与撤销 |
| A06 | 578528f7-2294-4915-99fb-fd85d77d32a6 | 推理模型与视觉模型的服务配置 |
| A07 | 564b5b94-30a1-4a80-9ad2-1dd1efd4d7e4 | 推理请求适配、结构化输出与视觉输入 |
| A08 | d6e7cfa7-99f5-4da0-9098-92702a68b1d8 | 自然语言规划器与能力约束 |
| A09 | 9177717e-d54c-46e3-b83e-9b3675552713 | 计划执行器、依赖调度与运行状态 |
| A10 | ed8b6dd2-e2c9-49ab-8656-e65c6fc5ef4e | 紧凑的一句话编辑入口与操作反馈 |
| A11 | e1b99a91-2b3b-4c03-9ca8-9f77eb7a3c30 | 临时预览、前后比较与参数微调 |
| A12 | e955e655-c33d-4e20-aa62-c8a3a1f44b5b | 常用模糊与风格滤镜算法 |
| A13 | 7505abfa-075d-405d-bcdd-9ffe9de8eb1f | 锐化、降噪与细节增强 |
| A14 | 8d7c82b8-0211-4068-8b7c-7342f1b79425 | 透视、镜头畸变与局部形变工具 |
| A15 | f451dc4f-d6d7-4a21-9178-b692673289f2 | 颜色调整、效果与局部蒙版的 AI 适配 |
| A16 | 2553bc91-6db9-43e0-8378-552c50d3dbea | 语义目标定位、分割与蒙版工具 |
| A17 | 220e882d-60db-4891-962b-555a43819d94 | 生成编辑路由、能力协商与参数适配 |
| A18 | 5446b035-c5b0-4fdf-8c7b-e11d1fe8451f | 生成任务队列、额度提示与可靠取消 |
| A19 | b2431637-e693-4cae-bb40-2909c03508f5 | 局部生成合成、保护区域与采用 |
| A20 | e5e34889-fad7-4d36-b81e-72c9eafe778e | AI 布光、背景匹配与合成协调 |
| A21 | ee15408c-900f-4045-8c5a-6be30dfb22da | 放大、去模糊与修复模型接入 |
| A22 | e845dcb5-6e8b-45d0-b45d-a7129aeee830 | 识字、图片文字替换与可编辑排版 |
| A23 | 1fc69f79-2bc3-418c-b07d-0f8b4b962ecb | 可编辑操作配方引擎与版本管理 |
| A24 | d0905d23-8b35-4295-96f2-be9d7a6569b1 | 电影调色与风格预设配方 |
| A25 | b58231aa-9702-4727-bcb3-fe7de39e2e31 | 人像自然精修配方 |
| A26 | c9c9a008-a96f-4cc6-9087-4046908f3346 | 产品抠图、背景与自然投影配方 |
| A27 | fc3e6f3d-63e1-4b43-8ccc-445c79ba36a4 | 双重曝光与创意合成配方 |
| A28 | 50dd5e0f-3913-4242-8884-f624335b860a | 海报排版、多尺寸与文字保护配方 |
| A29 | 8d439639-69fc-4fd8-b370-6902efd2f01a | 连续对话修改、操作记录与纠错 |
| A30 | 4326f70d-1119-4f4e-bb66-081095b1a341 | AI 编辑记录持久化与离线恢复 |
| A31 | 65482a83-9916-4164-8f93-b314539f19f7 | AI 配方批处理、预算与逐项结果 |
| A32 | 0bd0c9b8-75e6-4f3d-9e7a-168d48f167ae | AI 编辑评测集与质量回归体系 |
| A33 | a80140dc-841e-4a91-86d2-1fbe7a3937e5 | AI 工作流性能、内存与大图处理 |
| A34 | f869d0b1-e563-4ac4-8269-adddd115221a | AI 工具调用边界、凭据与数据保护 |
| A35 | 6bab7ff2-efdb-4bea-92c4-4736f6cc4f83 | 跨平台、无障碍与完整工作流验收 |
| A37 | ada2179a-3971-4ede-88d7-727a58c846f3 | 画笔、填充、修复、文字与路径的 AI 工具适配 |
| A36 | 9110cc9a-1498-4365-9768-23baddf97337 | 用户说明、能力声明与分阶段发布验收 |

## 交付状态

仅新增本 Markdown 和同名 JSON。没有改写既有计划、产品代码或测试，没有 commit/push、真实 API/凭据调用、远端任务变更。清单可用于独立评审与后续补证；当前测试失败、模拟/缺失能力与未执行像素验收均保留为剩余问题。
