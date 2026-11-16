# 图像处理与色彩集成记录

基线 c30a9ba8e06832f75e321146f95c3a6b6bcd939f；本轮无commit/push。验收方式ai，本记录是执行证据，不能替代独立验收。

## 集成修复

- RAW验证脚本曾覆盖RAW/ICC测试依赖的iccExportFixture。脚本现从同次解码baseline生成中心/四分之一位置的两个真实uint16 RGBA像素；三厂重跑和RAW导出复核通过。
- 分数蒙版矩阵有32次独立原生SVG渲染，原20s两次超时；改为该例60s。模型服务停止后逐次实测总41.795s，单次0.565–2.994s，32/32完成且全部像素断言通过。DRAIVIO_RESVG_TIMINGS=/absolute/path.jsonl 可写出逐次时间。本项仅测试预算校准，不是生产性能优化。
- Grounded说明中的待下载/实际推理状态已与真实本地模型证据同步；仍为仓库外显式可选依赖。

## 限制

- RAW需Python3/rawpy0.28/Pillow/LibRaw，支持矩阵明确拒绝CR3等当前不支持格式；16MiB输入、半尺寸16bit sRGB，普通预览导出8bit ICC PNG。
- GroundingDINO+MobileSAM需仓库外源码/校验权重/词表/隔离环境与显式本机网关；非打包默认能力。不承诺任意中文开放词汇。模型置信度未经校准，实例须用户明确选择。
- 16/32位编解码仅桌面PNG16/TIFF16/EXR32；浏览器显示预览sRGB；整数0–1裁切，EXR保留场景数值；高精度画布仅支持显式子集，其他效果/图层/混合明确拒绝，编码拒绝不支持的嵌入ICC。
- 浏览器ICC仅内置sRGB/DisplayP3 matrix/TRC；自定义RGB需原生moxcms。CMYK需Python/Pillow LittleCMS及目标ICC，最多4MP，合并为8bit4通道并铺白，保留RGB源/撤销；不提供PDF/X、专色或任意印厂保证。软打样仅预览，不修改源与普通导出。
- Resvg单例从20s改60s只是测试预算校准，实际32渲染41.795s，不是生产性能优化。原超时和夹具缺失tsc失败记录保存在/tmp/image-parent-*.log；最终重测取代失败检查。
- 共享未提交工作树；已有实现仅复核不归因本轮，未创建新提交，commit=null。
- 共享CPU下像素域重复有6例默认5s超时（5.5–8s），记录在/tmp/image-parent-pixels-final.log；最终以单worker30s预算复核，保留全部断言，非生产性能优化。

## 复核命令

```sh
npx vitest run src/adjustments src/filters src/imaging/enhancement.test.ts src/render/colorAdjustmentExport.test.ts src/render/geometryWarpExport.test.tsx src/retouch src/canvas/retouchComposite.test.tsx src/canvas/CanvasScene.adjustments.test.tsx src/canvas/CanvasScene.commonFilters.test.tsx --maxWorkers=1 --testTimeout=30000
```

最终23文件106项通过（单worker30s检查预算，退出0）

```sh
RAYON_NUM_THREADS=2 npx vitest run src/render/filterPipeline.pixels.test.tsx --maxWorkers=1
```

8 passed; initial original 20s matrix timeout reproduced twice, case budget calibrated to60s; all assertions retained

```sh
DRAIVIO_RESVG_TIMINGS=/tmp/image-parent-resvg-timings.jsonl RAYON_NUM_THREADS=2 npx vitest run src/render/filterPipeline.pixels.test.tsx -t "fractional mask boundaries" --maxWorkers=1
```

1 passed; 32/32 actual native renders, total41794.669ms, min564.791ms max2994.330ms; 7 unrelated tests not selected

```sh
npx vitest run src/masks src/ai/vision/SemanticSelectionWorkspace.test.tsx src/ai/vision/SemanticSelectionWorkspace.grounded.test.tsx src/ai/tools/selectionTools.test.ts src/ai/tools/selectionTools.pixels.test.tsx src/components/SelectionRefinePanel.test.tsx src/canvas/MaskOverlay.test.tsx src/canvas/selectionRaster.test.ts src/vector/pathGeometry.test.ts src/vector/vectorDocument.test.tsx --maxWorkers=2
```

35 passed; 4 opt-in real tests separately enabled and passed below

```sh
SEMANTIC_LIVE_ENDPOINT=http://127.0.0.1:8766/segment SEMANTIC_CLOTHING_IMAGE=/tmp/semantic-clothing.png SEMANTIC_REAL_SUBJECT=/tmp/semantic-real-inference.json npx vitest run src/ai/vision/SemanticSelectionWorkspace.grounded.test.tsx --maxWorkers=1
```

4 real inference/UI tests passed; explicit instance choice, original-grid mapping, undo, persistence, empty-object failure, cancellation, rotated subject/background feather complement. Only jsdom SVG capture seam supplied real photo; HTTP/model/reducer real

```sh
npx vitest run src/raw src/color src/render/highPrecision.test.ts src/render/precisionAsset.test.ts src/render/precisionCodec.test.ts src/render/precisionPipeline.test.ts src/render/precisionRepair.test.ts src/render/precisionScene.test.ts src/render/PrecisionDialog.test.tsx src/state/pixelFormat.test.ts src/state/precisionResources.test.ts --maxWorkers=2
```

70 passed; 1 opt-in real RAW project test separately passed below

```sh
DRAIVIO_RAW_PROJECT_FIXTURE=/tmp/raw-real-project.json npx vitest run src/raw/rawRealProject.test.ts --maxWorkers=1
```

1 real NEF project offline roundtrip passed

```sh
SEMANTIC_GROUNDED_CONFIG=/tmp/draivio-semantic-models/grounded.json SEMANTIC_CLOTHING_IMAGE=/tmp/semantic-clothing.png /tmp/draivio-semantic-grounded-venv/bin/python scripts/semantic/test_grounded.py
```

4 passed, actual external GroundingDINO+MobileSAM clothing instances and missing elephant failure; no skipped actual inference

```sh
SEMANTIC_TEST_IMAGE=/tmp/semantic-clothing.png /tmp/draivio-semantic-venv/bin/python scripts/semantic/test_gateway.py
```

4 passed, actual U2Netp HTTP alpha and missing/corrupt model failures

```sh
/tmp/draivio-raw311/bin/python scripts/test_cmyk_bridge.py
```

3 passed, independently reopened CMYK8 TIFF, ICC bytes, four samples/channels preserved, invalid profile/dimension rejected

```sh
/tmp/draivio-raw311/bin/python scripts/raw/verify_samples.py
```

3 real Canon CR2/Nikon NEF/Sony ARW samples passed actual exposure/WB/highlight changes, SHA256 unchanged, Nikon exact90deg orientation contract; repaired script also generated8 exact uint16 ICC fixture samples per camera

```sh
cargo test --manifest-path src-tauri/Cargo.toml image_codecs:: -- --test-threads=1
```

4 passed, real PNG16/TIFF16 uint16 and EXR32 float highlights/negatives, unsupported ICC/oversize/depth/nonfinite refusal

```sh
cargo test --manifest-path src-tauri/Cargo.toml color_management:: -- --test-threads=1
```

2 passed, actual profile intents and alpha, bad profiles rejected

```sh
DRAIVIO_RAW_PYTHON=/tmp/draivio-raw311/bin/python DRAIVIO_RAW_SAMPLE=/tmp/draivio-raw-samples/5227.NEF cargo test --manifest-path src-tauri/Cargo.toml raw_decode:: -- --test-threads=1
```

5 passed including actual native NEF decode, running cancel and malformed RAW rejection

```sh
npm run build
```

final tsc+vite passed after RAW fixture regeneration and final test instrumentation; only existing bundle/dynamic-import warnings

```sh
vibeplan check
```

passed; reports parent awaiting own integration and other project task statuses, no invented acceptance

```sh
npx vitest run src/render/colorAdjustmentExport.test.ts src/raw/rawExport.test.ts --maxWorkers=1 --testTimeout=30000
```

7 passed after fixture regeneration, actual RAW/ICC pixels and HSL export geometry/mask

本轮日志 /tmp/image-parent-*.log；精确逐次渲染证据 /tmp/image-parent-resvg-diagnostic.json。最终云报告包含每条标准结果；成功报告停在in_review，正式AIreview由独立审查执行。

最终结果：23文件106项像素领域检查退出0；全部领域检查支持送审。最终build退出0，未自行验收。
