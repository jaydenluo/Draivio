# F31 ICC 独立复核（2026-11-14）

复核范围：ICC 导入、转换、嵌入、文档往返与导出。复核者只读检查，不修改实现。

## 检查结果

- `npm test -- --run src/color/iccPipeline.test.ts src/render/exportImage.test.ts src/document/projectFormat.test.ts src/render/ExportDialog.test.tsx`：4 文件、28 测试通过。
- `cargo test --offline --manifest-path src-tauri/Cargo.toml color_management::tests`：2 测试通过。
- `npm run build`、`vibeplan check`：通过（构建保留既有 bundle/dynamic-import 警告）。

## 验收判定

1. **同色块导入外观与指定/转换数值：部分**。`processRgba`、原生 moxcms 及透明像素单元测试存在，但没有真实 PNG/JPEG/WebP 解码后比较“同色块不同嵌入 profile”的外观/像素样例，也没有 preserve 与 assign 的端到端对照。`prepareImageProfile` 尚未被测试调用。
2. **缺失/损坏/超大/不支持回退：部分通过**。解析器有大小、损坏和 RGB 校验及 sRGB fallback；但不支持 MIME/有效 WebP ICC 的独立往返测试缺失，错误反馈主要停留在函数行为，未见完整 UI 交互测试。
3. **一次显示转换、导出标签和色值：不充分**。导出测试使用 mock canvas，仅验证调用顺序；没有将导出结果用独立解码器读取，检查嵌入标签与转换后编码值。`exportSvgImage` 把转换后数值写回默认 sRGB canvas，再仅替换 ICC 标签，真实编码色值一致性没有证据。
4. **项目往返/撤销/透明：部分通过**。项目往返、设置撤销、透明 RGBA 单元测试通过。发现真实缺口：`DocumentSizeControl` 的 `mode === 'new'` 调用 `newDocument({width,height,background})`，没有传入所选 ICC profile 或 rendering intent；用户在“新建文档”模式选择的色彩设置会静默丢失。`newDocument` 类型和实现也只接受尺寸/背景。

## 建议修复

- 将新建文档 API 扩展为接收并初始化 colorManagement，或在打开后以同一事务设置 profile/intent，并添加组件回归测试。
- 添加固定真实图片样例：导入 preserve/assign 分别解码并比较像素/显示语义；PNG/JPEG/WebP 至少各一有效 ICC round-trip。
- 导出后使用独立 PNG/JPEG/WebP 解析器读取 ICC 与像素，记录预期/实际数值和容差；补齐 WebP ICC fixture。
