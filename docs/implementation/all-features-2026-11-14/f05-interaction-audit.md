# F05 组交互只读审计

2026-11-14。代码静态检查；以下 fixture 是待建立的失败样例，不是已运行结果。F05 同一任务继续修复，不创建替代任务，不把明确拒绝广泛操作当作整体验收。

## 当前缺口与定位

- `src/canvas/CanvasViewport.tsx:365,568`：update/up 将文档指针 delta 直接加到局部 transform.rect，忽略祖先和自身 affine 前缀。预览和提交均错误。
- `src/canvas/CanvasViewport.tsx:143–144`：localSelection/localPoint 仅逆自身矩阵，遗漏祖先；嵌套组中的画笔、形状、蒙版局部落点不正确。
- `src/canvas/CanvasViewport.tsx:449`：select hit test 仅检查未旋转 rect，忽略 affine、祖先及实际内容。
- `src/canvas/TransformOverlay.tsx:28`：边框只有 rect+rotation，没有 affine 或祖先变换。`CanvasViewport.tsx:582` 的 toPoint 是文档 clientPoint，resize/move delta 的空间与 rect 不一致。
- `src/layers/PropertiesPanel.tsx:18–25,69–71`：直接显示普通 transform 参数；组无 transform 时使用全画布100%而不是后代包围盒，旋转中心也是画布中心。
- `src/canvas/CanvasViewport.tsx:134–138,323,584`：textLayerStyle、hitTextAt 仅用自身矩阵，TextObject 接收文档指针；嵌套文字框和拖拽不匹配。`src/canvas/TextObject.tsx:65–91` 的屏幕旋转角在非均匀父矩阵下也不能当作局部旋转。
- `src/document/alignment.ts:112–116`：移动只逆父 worldMatrix，遗漏自身 affine 前缀；解组后的对齐也会错位。
- `src/document/alignment.ts:44` 已有未导出的递归 worldMatrix；`:58 layerCanvasBounds` 支持组 union，但叶层仍用整个0..100边界，不是真实形状/文字 bounds。

锁定 gate 已在 `src/state/editor.tsx:170` 调用 `layerWriteIsLocked`，对 transform 检查祖先/子树；PropertiesPanel 仅以 layer.locked 禁用控件属于界面反馈缺口，不是 reducer 越权。

## 最小统一矩阵方案

1. 提取百分比坐标 `worldMatrix(state,id)`、`parentPrefixMatrix`、world/local 点和向量转换；统一 alignment、viewport、AI context 的约定，避免另造几套矩阵。
2. 普通局部 rect 移动：文档 delta 乘 `inverse(parentWorld * own.affine)` 的线性部分，再加 rect。预览和 up 使用同一个纯函数。
3. 普通层 Overlay 置于父 world 与 affine 的 CSS matrix 下；toPoint 逆同一前缀。保留普通 rect/rotation 的局部编辑语义。只改边框视觉不足以修复手势。
4. 组包围盒递归 union 后代真实内容；组整体操作以包围盒为 pivot。文档操作矩阵 D 应转成 `inverse(P) * D * P` 后更新组自身矩阵，P 为父 world；不重写子对象局部数据，不做 AABB 后回写后代 rect。
5. 文字框使用完整 world matrix，TextObject 的指针使用 inverse world；旋转/resize 应在正确局部坐标空间计算，考虑非均匀缩放/剪切。
6. 每次手势在提交时一次 history；取消只清预览；锁定时不写文档。

## 必要失败集成 fixture

- 两级组：外层30度旋转及非均匀缩放，拖子层屏幕水平20px，世界位置准确平移20px，局部对象数据不改、一次 undo。
- 解组产生 affine child 后分别移动、右下 resize、旋转；验证世界角点和真实像素，不只检查 transform 字段。
- 中央两个小矩形组成组：Overlay/Properties 显示后代 union；围绕 union 中心旋转；空白画布不误命中。
- 嵌套组内画笔/形状点击已知世界点，保存的局部点经 world matrix 映回原点。
- 嵌套文字 HTML 编辑框与 SVG 对齐；move/resize/rotate/Escape/一次 undo。
- affine 解组后执行对齐，真实内容边界对齐目标。
- 上述操作增加祖先锁定，layers/history 不改变。
- viewport缩放200%、旋转90度下重复关键手势，避免只在CSS单位矩阵下通过。

## 异步跨文档同内容 revision

当前 UI 已通过 closure 固定发起文档：`src/layers/LayersPanel.tsx:15` 捕获 dispatch；`src/state/editor.tsx:442` dispatchWorkspace edit 固定 document.id；`:460` 每个 SessionProvider key 为 document.id；`src/document/documentWorkspace.ts:41–42,50–51` 按 id 查找并编辑，目标已关闭则丢弃。因此内容 revision 相同的 A/B 不会互相写入。contentRevision 本身不含 documentId 不代表 UI 路径缺少隔离。

待补 deferred rasterizer 集成测试：A发起、切B、resolve后仅A变；第二例关闭A再resolve，B不变且A不恢复。以上为静态推导，尚无本轮执行证据。
