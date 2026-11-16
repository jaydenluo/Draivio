# F05 分段合并阶段交接

只交接复杂合并阶段，不报告整个F05完成。组真实pointer/Overlay/bounds与含效果解组的已知缺口由父另协调。未report/accept/commit/push，未收费调用。

实现：同父连续normal合并为PNG；跨未选/隐藏节点或混合依赖分段，所有结果mergeBatchId相同并全选，中文显示实际段数。部分所选嵌套内容保原祖先包装，不移动scope外节点。完整所选且无hidden的group可整体烘焙；含hidden则保包装并递归分段，重新显示hidden仍在原stack slot和祖先效果下。父组自身原有内容在保包装路径保留，不静默丢弃。单独mixed层保外部blend/opacity，内部真实CanvasScene→serializeExport→exportSvgImage PNG；测试仅编码注入Resvg。

后续编辑：合并PNG采用冻结parentWorld逆物理矩阵转存affine，不用F19 documentSpace。父/自身移动旋转能继续改变内容。新共享layerWorldPixelMatrix精确包含祖先内容尺寸缩放。近I/整数平移的merged PNG仅在该时imageRendering optimizeSpeed避免Resvg float32双线性重采样；旋转缩放恢复默认采样；门控包含transformPreview目标/祖先draft，预览与commit一致。没有修改F19全局documentSpace。

事务/资源：PNG全成功前不写状态；abort/任一段失败/stale revision不写文档/undo。LayersPanel unmount abort并核documentId，切换同内容文档丢弃旧结果，原文档和新文档均无late写。mergeBatchId可选字段由现项目递归资源序列化保留，PNG自包含，无额外blob URL。删除对象同步过滤sceneOrder，hidden/scope外对象顺序保留；严格projectValidation验证sceneOrder，重新导入/undo/redo通过。

先红证据：/tmp/f05-segment-red.log 非连续/嵌套拒绝及hidden丢继承；/tmp/f05-pinned-red.log documentSpace后续移动方向错误；/tmp/f05-content-dims.log 不等content尺寸max12重采样差异；/tmp/f05-hidden-red.log hidden重显示顺序错误。均在同scope修复。新sceneOrder fixture还断言旧dangling sceneOrder严格validator必拒绝。

像素：非连续半透明ABC选AC，B/hidden深等、pixel逐字节相同；完整组baseline全部逐字节相同。嵌套部分选择含rotate/mask/screen/multiply只允许PNG量化max1/255、mean<.01；不等父content尺寸相同阈值。候选非空，之后parent/own移动旋转、隐藏重新显示、项目往返、undo/redo均真实栅格检验。

测试：最终精确命令与输出见 /tmp/f05-phase-final-bounded.log：npm test -- --run src/document/segmentedMerge.test.tsx src/document/groupTransforms.test.tsx src/layers/LayersPanel.merge.test.tsx src/canvas/retouchComposite.test.tsx src/canvas/retouchFrontier.test.tsx src/canvas/CanvasScene.test.tsx src/canvas/layerCoordinates.test.ts src/layers/LayersPanel.hierarchy.test.tsx src/ai/context/editorPreview.test.ts --maxWorkers=2 --testTimeout=20000 。初次默认并发9文件因Resvg争用发生5s超时，记录于/tmp/f05-phase-final.log，未把超时作为通过。固定2进程复跑判定见最新交接消息。

npm run build exit0（154 modules，既有chunk/dynamic import warnings），vibeplan check exit0（无队列），限定文件git diff --check exit0。

文件：src/document/segmentedMerge.tsx / segmentedMerge.test.tsx；groupTransforms.tsx / groupTransforms.test.tsx；src/canvas/layerWorldMatrix.ts / CanvasScene.tsx；src/layers/LayersPanel.tsx / LayersPanel.merge.test.tsx；src/state/editor.tsx仅新增Layer.mergeBatchId字段。

## Retouch cross-merge P1 / group-own P2 repair

独立预审发现旧phase回归未交叉覆盖repair。新增先红：/tmp/f05-retouch-red.log（仅base及base+R半透replacement改变）；/tmp/f05-own-red.log（组自身可见内容+仅hidden child报空）。修复后所有repairSourceIds引用目标强制独段；完整组跨repair边界保wrapper递归；raw bake暂不应用coverage（由最终R应用一次），结束后精确旧base→新segment映射，包括必要scope外repair引用维护，不扩大coverage到未采样邻层。group-own在原wrapper内容坐标生成raw PNG，保原blend/opacity/mask/transform与hidden子树；该group自身objects与sceneOrder清理，metadata保batch。

新增6项真实像素：base only/R外、base+R、base+未采样neighbor/R外、selected parent跨repair边界、own-group唯一hidden的selected/visible。所有结果pixels逐字节一致，retouch refs保存往返/undo通过。

最终精确命令：npm test -- --run src/document/segmentedMerge.test.tsx src/document/groupTransforms.test.tsx src/layers/LayersPanel.merge.test.tsx src/canvas/retouchComposite.test.tsx src/canvas/retouchFrontier.test.tsx --maxWorkers=2 --testTimeout=20000；exit0，5files32tests，/tmp/f05-cross-final.log。npm run build exit0（既有warnings），vibeplan check exit0。未开始interaction，停止源码交独立复核；此repair仍非整个F05完成报告。

## Blur ordering / transformed own-content review repair

先红 /tmp/f05-blur-red.log：selected referenced base blur80，外部半透明R；原烘blur后挖coverage错误。修复单段outer.adjustments留在replacement，raw不烘该outer调整，因此最终外部replacement mask先应用，再filter；新fixture逐字节一致。

先红 /tmp/f05-own-transform-red.log：含唯一hidden child的group自身红shape，rotate13 + 非均匀缩放。改own内容以真实世界视图栅格，在原group.children最底部插入独立PNG片段（原own内容在children下方），冻结groupWorld逆，不复用documentSpace；原group wrapper继续应用自身mask/filter/opacity/blend，保hidden原位。selected/visible原own用例和新变换用例均逐字节一致。

最终 npm test -- --run src/document/segmentedMerge.test.tsx src/document/groupTransforms.test.tsx src/layers/LayersPanel.merge.test.tsx src/canvas/retouchComposite.test.tsx src/canvas/retouchFrontier.test.tsx --maxWorkers=2 --testTimeout=20000：exit0，5files34tests，/tmp/f05-blur-own-final.log。npm run build/check/scoped diff-check exit0。仅修改segmentedMerge.tsx/test与证据，未开始interaction，待独立复核。

## Own-content repair retarget P1

先红 `/tmp/f05-own-ref-red.log`：外部 repair 的 `repairSourceIds=['own-group']` 在 own-content 搬到新 child 后仍指向空 wrapper，修复区域不再生效。新增 `ownTargetRemap`，将原组自身内容引用精确改到新 bottom content segment；不把整组包装替换，也不扩大 coverage。真实像素、隐藏子层与项目结构断言通过。

最终 bounded command：5 files / 35 tests passed，`npm test -- --run src/document/segmentedMerge.test.tsx src/document/groupTransforms.test.tsx src/layers/LayersPanel.merge.test.tsx src/canvas/retouchComposite.test.tsx src/canvas/retouchFrontier.test.tsx --maxWorkers=2 --testTimeout=20000`，exit 0；build/check exit 0。
