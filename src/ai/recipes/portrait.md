# 人像自然精修

Composer → 人像自然精修。选择本地 RGB8 顶层普通图片工作副本，用自由选区、椭圆或精细蒙版依次捕获人物、皮肤、眼部，胡须/眼镜/文字等加入保护；确认是目标人物后才能预览。矩形框不能作为精确人物或五官分区，空分区、超出人物分区、锁定/隐藏/嵌套/特殊图层会明确拒绝。多人不自动代选；不接受低置信度模型候选替代人工确认。

可分别开关/调整：手工指定瑕疵点的局部修复、低半径保纹理降噪、轻微肤色偏移和眼部提亮。没有生成步骤、变形、缩放或自动五官识别；尺寸和alpha保持。眼部不执行锐化或改变形状。保护区存在任何覆盖即绝对排除，皮肤处理也排除眼部。

捕获分区绑定文档、内容revision和目标图层；选择/文档/内容变化会使候选失效。预览不写文档，取消/失败不采用，确认一次可整体撤销。原图保留隐藏，阶段为累积PNG快照，只有最后一层可见，避免叠加透明度；阶段不是独立可混合滤镜。调整参数要重新预览。精确分区以既有已验证的layerMasks保存，控制层隐藏锁定，项目往返保持。前后预览通过真实CanvasScene，与导出共享来源语义。

执行 `PORTRAIT_EVIDENCE_DIR=docs/evidence/portrait npx vitest run src/ai/recipes/portrait.photos.test.tsx --maxWorkers=1` 可重现真实照片前后图和纹理量化。照片许可/源/哈希见该目录。保护区/人物外像素必须逐字节不变；低强度降噪后高频纹理保留比例按相同皮肤像素记录。原图不被重写，无付费请求。

限制：最多2048²像素；需要手工可靠分区。没有自动诊断瑕疵、识别人脸或推断肤色身份。当前样例不代表所有肤色/光照/眼镜情形。原任务“至少三种肤色和不同光线样例人工评审”尚未发生，AI目视/像素测试不能冒充真人审评，必须保留未验收状态并收集真实审阅者意见。

Independent review repair (2026-11-16): cumulative snapshots remain immediately above their original portrait in global and active-artboard stack order, preserving existing foreground occlusion. Real CanvasScene/Resvg pixel regression covers foreground, multi-board isolation, project reopen and undo. No human review is inferred.
