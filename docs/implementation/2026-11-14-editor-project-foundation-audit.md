# 编辑器与项目基础首轮审计

`npx vitest run src/canvas src/document src/state/documentHistory.test.ts src/state/layerWorkspace.test.ts src/render/exportImage.test.ts src/creation/imageBatch.test.ts`：49 个文件、328 项通过。

已覆盖画布/图层/选区/蒙版/文字/变换/历史、项目格式与恢复、PNG/JPEG/WebP/SVG 导出、选区/图层范围、尺寸与对齐、生成批处理等离线行为。

本轮补充 `src/render/batchExport.ts`：提供有界并发、逐项失败保留、Abort 后排队项取消的批量导出编排 API；2 项测试通过。它目前是编排层，未绑定 ZIP/文件系统下载 UI，浏览器验收仍需产品入口接线。

剩余风险：多文档宿主已存在但项目保存/生成异步任务的完整跨标签回写仍需继续核验；批量导出暂无 UI/归档格式，不能宣称完整交付；真实浏览器像素与原生文件对话框验收未由本轮自动测试替代。
