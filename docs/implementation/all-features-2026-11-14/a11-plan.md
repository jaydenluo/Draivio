# A11 临时预览、前后比较与参数微调

任务 e1b99a91-2b3b-4c03-9ca8-9f77eb7a3c30；Git base c30a9ba8e06832f75e321146f95c3a6b6bcd939f。用户授权全量实施、父代理委派；仅实现，不自行报告/验收。依赖 A05/A10 已完成。

## 设计决策与范围

采用独立候选视图复用 CanvasScene。相比覆盖正式画布state，独立候选不会影响保存、导出、历史或手动工具；相比静态截图，可直接展示矢量/图层真实效果。Composer先展示动作计划，确认生成候选，再采用/放弃。候选复用执行器及 executeEditorCommand；采用调用已有 apply-edit-plan 原子提交。保留既有图像生成模式，不涉及网络。

候选包含文档ID、捕获的正式state引用作为保守revision，以及 structuredClone 的base、步骤、结果；每次参数微调从base重新执行全部步骤，不对旧候选追加。前后切换仅切换 CanvasScene 的输入。数值字段仅展示工具实际支持的 dx/dy/sx/sy/degrees/value；使用对应 EditorCommand 和既有验证，不新增伪工具。已过期候选禁止采用，异步结果校验ID/revision，失败/取消释放候选引用。正式保存/导出只读正式state；采用后相同CanvasScene渲染相同内容。

## 文件与步骤

1. 先添加 src/ai/execution/preview.test.ts 与 Composer 预览集成失败用例；记录真实失败输出。
2. src/ai/execution/preview.ts 管理隔离base、执行/微调及过期检查；src/ai/ui/EditPreview.tsx 展示实际 CanvasScene、前后切换、关键参数、采用/放弃。
3. src/creation/AIComposer.tsx 将候选接入计划确认，已有执行 guard、取消、锁定失败、文档检查保留；测试撤销重做及重复确认/执行中取消。
4. 运行专项、ImageGeneration/Composer 回归、npm run build、vibeplan check。交父代理独立审查，不自行 report/accept。

## 验收映射

- 2f34e52f-5fcd-400c-be09-5e19d0b61adb：真实候选SVG不同，正式文档与undo/redo相同，放弃后完全不变，执行中取消无写入。
- 39a6c3bd-ca6d-4663-8122-fe194622ca49：采用后一步undo，撤销回原图、redo回候选，重复确认/采用不重复写入。
- c3e6145d-806d-4790-8ede-b9d2fbed1901：连续微调同一候选从base重建，参数不叠加，前后切换真实图层transform/opacity变化，采用前后导出结构相同。

## 风险与当前状态

A04 transformOf 输入变异由父代理合法reopen修复；本任务仍克隆base以隔离。候选保留一份文档内存，放弃/失效/新候选替换后释放引用；复用已有图像URL不额外创建资源。保守state引用校验可能因UI变化要求重新预览，优先保证不会覆盖并发编辑。历史：task:start v8 后先等待A04/A05/A08和原导出任务修复；均由父独立复核完成后恢复。此决定现已被下面完成记录替代。

## 实施完成检查点

已完成计划步骤1–4：真实Composer→executor→独立CanvasScene候选→显式采用单事务；参数从base重建；所有可见放弃路径abort；ID/revision过期阻止。5files27tests专项回归exit0、build exit0、vibeplan check exit0。详细criterion映射、取消/重复提交、真实serializeExport→Resvg像素证据见 a11-worker-result.md。无收费调用、无commit/push；下一步父代理独立只读复核，工作代理不report/accept。

独立预审修复：A11 executePreviewStep统一工具字段白名单，op不可覆写，目标必须显式且全部处于scope；新增3项先失败回归已通过。最终5files27tests/build/check exit0，待父复核。
