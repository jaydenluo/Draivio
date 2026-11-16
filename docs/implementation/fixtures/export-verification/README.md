# F03 独立导出验收输入

本目录的作品、输入 PNG 和期望值由 `generate_fixtures.py` 直接构造，不调用 Draivio 导出代码。`color-blocks-input.png` 是公开的测试输入，**不是浏览器导出证据**。不要把它复制到下载目录冒充实际导出。

## 固定作品与数学期望

- `color-blocks.draivio`：128×128 透明画布，内嵌 PNG；红、绿、蓝块为 `[16,48)×[16,48)`、`[80,112)×[16,48)`、`[16,48)×[80,112)`；黄色块 `[80,112)×[80,112)` 的 RGBA 为 `(255,255,0,128)`。未覆盖区域透明。
- 椭圆选区中心 `(64,64)`、半径 48，边界裁切后为 96×96，原点 `(16,16)`。四角位于选区外，应透明；它们原先部分含有颜色，能区别真实椭圆裁切和只裁矩形边界。
- `effects.draivio`：矩形原始范围 `[16,48)²`、颜色 `#204060`，亮度 +100 后为 `#4080c0`。先水平翻转再顺时针旋转 90°，映射为 `(128-y,128-x)`；蒙版保留原始 x≥32，因此最终非透明矩形为 `[80,112)×[80,96)`。子层 50% 与父组 50% 合成 alpha 为 64（允许 2 级量化误差）。另有独立 `F03` 洋红文字，不依赖跨平台字形的固定边缘像素，检查指定区域有墨迹。
- 选择 `effect` 导出图层时，`effects-layer` 场景假设包含父组效果（alpha 64），不包含兄弟文字层。请与导出对话框的实际范围说明核对。该作品打开后默认选择 `effect`。

`manifest.json` 记录零基像素坐标及 RGBA。探针都避开几何边缘，不把浏览器抗锯齿细节作为精确预期。PNG RGB 默认容差 2，JPEG/WebP RGB 默认容差 18，alpha 容差 2；有损格式仍必须满足 alpha/底色要求。可以用 `--tolerance` 显式收紧或按已记录的编码质量调整 RGB 容差。

## 浏览器操作与验证

在真实应用中通过“打开项目”打开 `.draivio`，导出实际文件。至少检查：

1. `color-blocks` 整画布：PNG 128×128、WebP 256×256、JPEG 128×128 且底色 `#ffffff`。
2. `color-blocks` 选区：PNG 96×96，椭圆外透明。
3. `effects` 整画布及 `effect` 图层：PNG 128×128，与画布预览并排检查；选区框、控制柄和文字选择状态不可出现在下载中。文字区域自动检查仅针对整画布。
4. 导出前后项目未变化、取消未下载文件、无效源/尺寸失败，不由本脚本替代交互验收。

使用已有 Pillow 的 Python，例如本机：

```sh
PYTHON=/Users/szys/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
FIXTURE=docs/implementation/fixtures/export-verification
"$PYTHON" "$FIXTURE/verify_download.py" /absolute/path/download.png --scenario blocks-canvas --format png
"$PYTHON" "$FIXTURE/verify_download.py" /absolute/path/download.webp --scenario blocks-canvas --format webp --width 256 --height 256
"$PYTHON" "$FIXTURE/verify_download.py" /absolute/path/download.jpg --scenario blocks-canvas --format jpeg --background ffffff
"$PYTHON" "$FIXTURE/verify_download.py" /absolute/path/selection.png --scenario blocks-selection --format png
"$PYTHON" "$FIXTURE/verify_download.py" /absolute/path/effects.png --scenario effects-canvas --format png
"$PYTHON" "$FIXTURE/verify_download.py" /absolute/path/layer.png --scenario effects-layer --format png
```

脚本强制 Pillow 完整解码，检查 magic/container、解码格式、独立推断的 MIME、尺寸、像素和透明度，输出 JSON 并以 0/1 表示通过/失败。磁盘文件无法保留原 Blob 的 MIME；如浏览器另行捕获 Blob/响应 MIME，传入 `--mime image/png` 等一起核对，否则 JSON 明确记录 `capturedMimeChecked: false`。不要把扩展名当作实际 MIME 证据。

指定不透明背景时传 `--background RRGGBB`，以 `source × alpha + background × (1-alpha)` 计算期望；JPEG 必须明确传入底色。调整导出尺寸时同时传 `--width`、`--height`。

## 输入自身验证（不是浏览器验收）

```sh
"$PYTHON" "$FIXTURE/generate_fixtures.py"
npm test -- --run docs/implementation/fixtures/export-verification/fixture.test.ts
"$PYTHON" "$FIXTURE/verify_download.py" "$FIXTURE/color-blocks-input.png" --scenario blocks-canvas --format png
```

最后一条只证明输入 PNG 与解析期望一致。实际下载文件另存验证输出，记录真实路径、命令、退出码和浏览器交互证据。

## 独立浏览器测试入口

`browser-harness.html` 是仅开发验收使用的独立入口，生产 App 不导入它。它挂载真实 `AppShell`、`EditorProvider`、`TopBar` 和 `ExportDialog`，通过显式按钮把上述已知 fixture 交给真实 reducer，再由正式导出对话框生成下载文件。增加的指纹指示器比较导出前后文档内容。可在 Vite 中打开 `/docs/implementation/fixtures/export-verification/browser-harness.html` 重复验收。

本轮 IAB 的文件 chooser 事件未返回（打开按钮和直接文件 input 均超时）；因此上述 fixture 使用验收按钮载入，不宣称完成原生文件选择器验收。`actual/` 中的文件均来自浏览器真实下载后复制保存，`.validation.json` 是 Pillow 对这些实际下载的独立验证结果。
