# F10 最终独立复审 v2

复审为只读，运行最新实现与构建。

验证结果：

- F10 专项：6 files / 32 tests，exit 0。
- `npm run build`，exit 0；产物包含 `dist/assets/refineWorker-p1zqbGNb.js`。
- `vibeplan check`，exit 0。

验收结论：

1. **失败/部分通过。** 白底彩边固定 RGBA fixture 已证明 `refineAsync` preview 与 layer-only export 的纯函数输出一致，alpha 保留也通过。但生产入口在 [AppShell.tsx] 中直接对完整 `.canvas-art` 调用 `rasterizeSvgPixels`，没有隔离目标图层；低清 RGBA preview 因此可能采样其他图层/合成背景，不能证明逐层 preview 与逐层导出一致。必须先生成目标 layer-only SVG/像素源，再提交 criterion 1。
2. **通过。** Apply 冻结目标 layer/selection，revision 变化和取消不 dispatch；Escape/Cancel 会 abort Worker；AppShell 回归确认无 mask/history 写入。
3. **通过。** MaskOverlay 声明 `smooth-shift-feather-density`，与 refineMask 顺序一致；density/feather 控件进入 mask/selection 数据；项目/导出测试通过。
4. **通过。** 低清 preview 会回调并绘制真实 canvas；全清计算使用生产 Worker，AbortController 可 terminate；alpha clamp 和 stale revision 有测试。

结论：F10 仍不能验收。唯一剩余关键问题是生产入口的 source RGBA 未按目标图层隔离，导致彩边 preview 可能污染合成内容。不要提交成功报告或验收。
