# F10 最终独立复审

复审范围：最终修复后的 F10。只读检查并运行专项测试。

## 结果

- 专项：`npm test -- --run src/masks/refineMask.test.ts src/masks/refineAsync.test.ts src/components/AppShell.test.tsx src/components/SelectionRefinePanel.test.tsx src/render/exportImage.test.ts src/canvas/CanvasScene.test.tsx`，6 files / 30 tests，exit 0。
- `npm run build`，exit 0；生产产物包含 `refineWorker-*.js` worker chunk。
- `vibeplan check`，exit 0。

## 验收逐项

1. **部分通过。** `alphaToSelection` 已保存 alpha 数组，固定半透明 alpha 不再二值丢失；真实低清 alpha 已绘制到 `CanvasViewport` canvas；layer-only export 才运行去彩边，避免污染合成导出。仍缺独立白底彩边端到端预览对照，去彩边主要由导出后处理验证。
2. **通过。** Apply 冻结目标 layerId/selection，revision 变化或取消不 dispatch；Escape/Cancel 调用 AbortController；AppShell 回归确认无 mask/history 写入。
3. **通过。** MaskOverlay 明确 `smooth-shift-feather-density`，嵌套顺序与 `refineMaskAlpha` 一致；density/feather 控件可调并进入 mask/selection 数据；项目/导出专项通过。
4. **通过。** `refineAsync` 先回调低清预览，生产构建含 Worker，全清计算可通过 AbortController terminate；边界 alpha clamp 和 stale revision 丢弃有测试。

## 结论

F10 仍不建议整体验收：criterion 1 的白底彩边固定端到端预览/导出对照不足，去彩边没有在低清预览中显示，只有 layer-only 导出后处理证据。其余三项通过。
