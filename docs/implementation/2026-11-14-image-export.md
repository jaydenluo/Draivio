# F03 图片导出实现与验证

## 实现范围

- TopBar 使用独立 exportScene 克隆现有 CanvasScene；清除编辑叠层，不更改作品状态。画布输出当前可见画布大小（尊重已提交的 cropRect）；当前图层输出同样的可见画布范围并保留祖先组的变换、蒙版、调整、不透明度。缺失/隐藏目标明确失败。
- 选区范围复用 MaskDefinitions，包括椭圆、套索路径、布尔组合、反选与像素羽化。先对共享合成结果套选区 mask，再按真实 selection.rect 与可见画布的交集裁切；无交集明确失败，外部保持透明。
- PNG/WebP/SVG 默认透明，可指定六位十六进制底色。JPEG 明确采用所选底色（默认白）。栅格经单次 SVG Image 解码和 drawImage 输出，指定 sRGB canvas；编码结果必须非空且 MIME 严格匹配请求。8bit sRGB，不提供 ICC、CMYK 或高位深。
- 单边最大 16384，最多 32MP；校验格式、尺寸、质量与背景。请求、解码、编码均有超时；图像 object URL、解码资源和画布及时释放。
- HTTP(S) 外链及本地同 origin blob 图片通过统一 requestImageData 内嵌（禁止重定向、无凭据、32MB/单资源、类型校验）；所有现成内嵌和下载后的图片逐一用独立 Image 实际解码、校验自然尺寸，避免 SVG 整体 onload 成功却静默漏掉损坏图片；同 bytes 只验证一次。失效资源明确失败。调用方 AbortSignal 可取消下载。无真实付费 API 请求。
- 对话框使用字段白名单读取偏好，忽略跨文档尺寸；范围切换以范围尺寸锁比；SVG 输出宽高同样生效。体积为基于尺寸/格式/质量的估算，非真实编码大小。
- 导出模态打开时焦点进入控件，Tab/Shift+Tab 环绕，外部抢焦点会拉回；document capture 阻断全局编辑快捷键传播（保留原生表单输入和按钮 Enter/Space），Escape 取消，关闭恢复触发器焦点。
- generation、AbortController 与 documentId/session/revision 组合隔离异步结果。取消、关闭、重开或作品变更后不会触发旧下载/成功提示；偏好存储失败不影响导出。错误走共享 message 并保留对话框错误文本。

## 本次可重复证据

先新增并运行失败测试，复现 injected decoder 不绘制、缺失 context 被伪造、空/MIME 回退结果误成功、非法参数未拒绝、取消未收束、选区 mask/命名空间缺失以及偏好损坏等问题，再实现修复。

针对性命令：

```sh
npx vitest run src/render/ExportDialog.test.tsx src/render/exportImage.test.ts src/canvas/exportScene.test.tsx src/canvas/layerExtraction.test.tsx src/lib/projectImageRequest.test.ts src/lib/request.test.ts src/canvas/documentIO.test.ts
npm run build
```

本实现阶段最终针对性结果：7 个测试文件、74 项通过；npm run build 通过。主代理会补充全量、vibeplan check、浏览器独立解码与 4K 实测。构建保留既有大 chunk 提示。

独立需求复核后追加回归：损坏内嵌/下载资源须在整 SVG 解码前失败；默认 Image 的成功、损坏、零尺寸、超时、取消均清理 src/handler，迟到结果释放；裁剪 canvas/layer/selection 的 viewBox 和默认尺寸一致；偏好数组不得伪装字符串枚举。

质量复核发现并复现打开导出后 Arrow/Delete/Ctrl+D 仍会修改真实画布/图层；修复后通过带真实 EditorProvider + TopBar + CanvasViewport + LayersPanel 的集成测试，确认按键不改变层、选区、revision，且表单输入、按钮 Enter/Space、Tab 环绕、Escape 与关闭焦点恢复有效。

## 验证边界

jsdom 用可绘制解码对象和明确 canvas 边界替身验证控制流、drawImage、尺寸、MIME/空编码拒绝、取消、错误与清理；它无法证明真实浏览器编码或像素精度。真实 PNG/JPEG/WebP 文件与 Pillow 独立像素验证位于 fixtures/export-verification，由独立验收阶段生成。原生 Tauri/WebKit、Windows、字体跨平台完全一致性和原生进程内存尚未验证，不以浏览器或 jsdom 代替。

32MP 单张 RGBA 缓冲理论为 128MB（十进制）；解码源和目标画布可能同时占用，编码与浏览器内部缓冲另计。4K 的实际时长/内存需使用真实浏览器记录，不由理论推算为实测。

## 主代理真实浏览器证据

在独立 `127.0.0.1:5198` Vite 源，通过 `fixtures/export-verification/browser-harness.html` 挂载真实 AppShell/TopBar/ExportDialog。IAB filechooser 事件未返回，因此仅将固定公开测试作品用验收按钮交给真实 reducer；未冒充完成系统文件选择器验收。独立期望由 Python/Pillow 构造，不调用产品导出生成期望。

实际浏览器下载文件复制在 `fixtures/export-verification/actual/`，每份对应 `.validation.json`：

- blocks.png：128² PNG，透明/全色/半透明黄色 alpha128 正确。
- blocks.webp：256² WebP，透明及半透明保持，RGB有损容差18；实际探针全部通过。
- blocks.jpeg：128² JPEG，透明区变白，半透明黄色合成白底正确。
- selection.png：96² 椭圆选区，带原始颜色的四角在选区外变透明。
- effects.png / layer.png：128²，旋转、翻转、蒙版、亮度调整、父组与子层各50%（alpha64）探针通过，整画布含文字，图层导出不含文字兄弟层；文档指纹保持。
- blocks-4096.png：4096² PNG，从点击导出到下载事件可用的工具端墙钟约280ms，Pillow完整解码/尺寸/颜色/alpha通过。该时间含UI自动化往返，不是原生性能基准。单RGBA缓冲64MiB为理论预算，实际进程内存未测。
- cropped.png / cropped-selection.png：裁剪输入128²内的[16,48)²，实际输出32²；整画布为红色，椭圆选区交集左上透明/右下红色，探针通过。
- cropped-scaled.svg：XML独立读取width/height64、viewBox `16 16 32 32`，保留裁剪且宽高设置生效。

损坏 `data:image/png;base64,AQID` 在真实浏览器显示“图片资源无法解码，无法导出”，对话框保留并使用共享message，未进入成功下载路径；失败/关闭后文档指纹不变。截图 `browser-corrupt.jpg`。裁剪和复杂效果截图分别 `browser-crop.jpg`、`browser-effects.jpg`。在表单取消后文档指纹不变；慢异步取消由有意挂起decoder的组件回归覆盖，不将快速浏览器取消冒充慢网络验收。

## 最终复核与集成检查

独立需求复核关闭资源解码、裁剪和偏好问题；独立质量复核发现并关闭模态键盘隔离问题。真实浏览器验证初始焦点进入、Delete/方向/复制快捷键不改文档，Escape关闭恢复TopBar触发器焦点。最终资源校验补丁后再次4K PNG实测约278ms、Pillow完整解码通过，结果替换actual/blocks-4096.png及validation。

主代理最终执行 `npm test -- --run --maxWorkers=4`：97文件526测试通过exit0；`npm run build`通过exit0（既有大chunk提示）；`vibeplan check`与`git diff --check`均通过exit0。无提交推送。原生Tauri/WebKit、Windows、真实进程内存和系统文件选择器仍按上文未执行限制保留。
