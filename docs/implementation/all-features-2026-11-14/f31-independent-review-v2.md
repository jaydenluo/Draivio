# F31 ICC 独立复核 v2（2026-11-14）

复核者对实现与测试进行只读复核，未修改生产实现。

## 证据

- `npm test -- --run src/color/iccPipeline.test.ts src/render/exportImage.test.ts src/document/projectFormat.test.ts src/render/ExportDialog.test.tsx`：4 个文件、31 项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml color_management`：原生 ICC 测试 2 项通过。
- `npm run build`：通过；仅已有 bundle/dynamic-import 警告。
- `vibeplan check`：通过，无待上传事件。

## 验收标准

1. **同色块/profile 语义与指定/转换差异：通过。** sRGB/Display P3 使用矩阵/TRC 真转换，已验证红色 `[255,0,0] -> [234,51,35]`；自定义 ICC 明确转入 moxcms 原生路径，不按名称近似。导入 preserve 保留嵌入 profile，assign 重写容器 ICC 且保持通道数据。
2. **缺失、损坏、超大、不支持：通过。** PNG/JPEG/WebP 容器读取均有结构校验、4MB 上限与 RGB/XYZ profile 校验；导入异常回退 sRGB 并显示 warning，UI 对不支持格式/文件错误给出 notice；导入策略可记忆。
3. **一次显示转换、真实导出 ICC 与色值：通过。** source 保留嵌入 ICC 交给浏览器一次显示管理；导出真实读取 RGBA，按目标 profile 转换后重新编码，独立 PNG fixture 解析 IDAT 得到 `[234,51,35,255]`，透明像素 RGB 保留，并 inflate iCCP 验证完整 profile bytes。PNG/JPEG/WebP embedding 与 WebP RIFF 长度、有效 ICCP round-trip 均有测试。
4. **项目往返、撤销、透明：通过。** project encode/decode 保存 profile bytes/checksum/renderingIntent；`set-color-management` 纳入 undo snapshot；new document 初始化携带设置；透明像素不转换 RGB，且导出测试验证无彩边。

## 边界

未调用真实付费服务；自定义 ICC/absolute-colorimetric 在浏览器环境明确要求桌面原生引擎。显示器硬件校准、CMYK/软打样仍属于独立任务。
