# F10 最终独立复审 v3

只读复审最新 layer-only 修复并重跑专项。

- `npm test -- --run src/masks/refineMask.test.ts src/masks/refineAsync.test.ts src/components/AppShell.test.tsx src/components/SelectionRefinePanel.test.tsx src/render/exportImage.test.ts src/canvas/CanvasScene.test.tsx`: 6 files / 32 tests passed，exit 0。
- `npm run build`: exit 0；产物包含 `dist/assets/refineWorker-p1zqbGNb.js`。
- `vibeplan check`: exit 0。

验收结果：

1. **通过。** AppShell 现在通过 `layerOnlySvg` 克隆并移除非目标 `data-layer-id` 节点及 mask preview 后再 rasterize source RGBA；多层污染 fixture 验证目标保留、其他层和 mask preview 移除。`refineAsync` preview RGBA 与 layer-only export 共享 `decontaminateFringe` 语义，白底彩边固定像素对照通过，半透明 alpha 保留。测试直接验证隔离结构和共享像素函数；生产入口已使用该隔离源。
2. **通过。** Apply 冻结目标 layer/selection，revision 变化或取消不 dispatch；Escape/Cancel abort Worker；无 mask/history 污染回归通过。
3. **通过。** MaskOverlay 顺序为 `smooth-shift-feather-density`，与纯算法一致；density/feather 控件进入数据和 preview/commit，项目/导出测试通过。
4. **通过。** 真实低清像素 preview 绘制到 CanvasViewport canvas；全清计算使用生产 Worker，AbortController 可 terminate；边界 alpha clamp、stale revision 丢弃和 layer-only export 已验证。

结论：四条验收均通过，可进入 report 并按授权流程逐项标记 passed 后 approve。限制：resvg 对 non-scaling-stroke 仅能验证 SVG 属性，scaled stroke 像素路径已验证；此限制已在 worker 证据中披露。
