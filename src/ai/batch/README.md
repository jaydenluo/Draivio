# 配方批处理

在 Composer 点「配方批处理」，选择多张PNG/JPEG/WebP或目录，选择输出目录，输入或复制已有编辑配方JSON及参数，将一个必需输入槽映射到每个文件的底图。可设置并发1–2、输出前缀、请求上限与整数微单位预算。先点「试跑第一张」并下载检查真正PNG，再点「开始剩余批量」。每文件创建独立编辑器文档，运行真实runRecipe事务和共享CanvasScene PNG导出，完全不dispatch当前作品。

当前运行的工具是已有editorRecipeTools，仅本地编辑，无模型请求与费用。未注册工具（包括远程provider）明确拒绝。预算不是本地CPU计费：未来provider适配必须提供每次尝试的完整请求/费用上界，BatchBudget在派发前原子保守预留；试跑、并发和失败重试共用总上限，失败不返还不确定费用，成功不重试。没有实现远程模型接入，预算测试为reservation合同验证，不是供应商账单证据。

输出通过已有writeBatchOutput写入选定目录，不覆盖原文件或已有输出；名称包含清理后的前缀、原basename与序号，碰撞再加数字。批内写出串行，避免浏览器查重竞态。其它进程与当前浏览器同时创建同名文件不在浏览器API原子保证范围；桌面后端具有create_new。支持最多1000文件、每张32MB/8MP。PNG保留透明度，导出复用既有色彩/滤镜管线。

取消会停止新排队，处理中结果在写出前检查AbortSignal，已成功写出的保留。「仅重试失败项」不会执行成功项；取消/预算停止/写出不确定/上次中断不会自动重试。写出不确定时缓存已生成PNG供下载，需人工检查输出目录，不能盲目再次收费渲染或重复写出。

IndexedDB保存批次JSON及生成PNG；写入失败（如配额）会停止新排队。刷新/重启仅加载只读历史和可下载结果，不保存源文件token/浏览器句柄，不重发模型、重新渲染或再次写出；必须重新选文件与目录创建新批次。历史清理删除结果缓存，不删外部已写出的文件。当前项目文档无额外字段；批次是独立本机任务记录，不污染作品或其撤销历史。

验证：

```sh
RECIPE_BATCH_EVIDENCE_DIR=docs/evidence/recipe-batch npx vitest run --maxWorkers=2 src/ai/batch/recipeBatch.files.test.tsx src/ai/batch/recipeBatch.test.ts src/ai/batch/recipeBatchRender.test.tsx src/ai/batch/RecipeBatchWorkspace.test.tsx src/creation/AIComposer.recipeBatch.test.tsx
```

真实文件测试创建两张同basename的原生PNG与一份损坏文件，读真实文件bytes通过readBatchInput、真实recipe事务、真实SVG/PNG渲染与磁盘写出（测试用文件系统目录适配浏览器handle，复用生产writeBatchOutput）。已有输出保持原字节，源图hash不变；坏项修正后只重试坏项，成功项attempt不变；每张PNG输出alpha70%并核对下载blob字节等于实际磁盘文件。`docs/evidence/recipe-batch`保留原创前后PNG与执行JSON，包括文件位置、hash、状态、attempt、预留和0模型成本。

UI测试mock文件选择器/编解码边界验证交互，真实production Composer可达测试使用实际组件树。预算/取消/重启合同与真实本地文件证据分开记录。操作系统原生选择对话框、生产WebView PNG编码和IndexedDB跨进程恢复需桌面端交互复核；不将测试适配器伪称Tauri弹窗或外部模型实测。
