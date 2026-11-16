# F23 独立只读复审

## 结果

四项验收均通过。未调用真实付费服务，使用固定契约和本地 reducer/请求测试。

- 专项：7 files / 33 tests passed，exit 0。
- `npm run build` passed，exit 0；已有 bundle size warning。
- `vibeplan check` passed，exit 0。

## 逐项证据

1. `imageEdits.test.ts` 验证 base64 与 multipart 编辑契约、参考图、规范化尺寸、quality 和模型能力过滤；不支持的参数既不发送，AIComposer 根据能力显示参数。
2. `ImageGeneration.test.tsx` 与 `imageEdits.test.ts` 验证显式 edit/generate intent、参考图 data URL、编辑端点 `/images/edits`，原图层保留。
3. ImageGeneration 固定响应验证结果保留 source/thumbnail、reference metadata、提示词/模型/参数并进入候选；采用沿用原任务替换/撤销流程。
4. `imageBatch.test.ts` 验证取消、部分失败、unknown 结果不自动重试；context guard 验证跨文档/版本结果不写入。
5. `ModelGuide.test.tsx` 验证可打开模型说明，解释 strength 非通用能力；能力表驱动质量/steps/guidance/strength，不虚构模型支持。

风险：未进行真实网络或付费调用；服务端实际能力依赖配置的 provider/model capability 声明。
