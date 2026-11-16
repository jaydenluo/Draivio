# A11 实施交接

任务 e1b99a91-2b3b-4c03-9ca8-9f77eb7a3c30，Git base c30a9ba8e06832f75e321146f95c3a6b6bcd939f。实现工作已验证，等待父代理独立复核；工作代理未 report/accept、未 commit/push、未调用收费服务。

## 真实行为

一句话编辑先展示动作计划；确认后 PlanExecutor 在私有 draft 运行真实 executeEditorCommand。成功后仅生成候选，RunSummary 为 preview，尚无撤销按钮；采用才 dispatch 一次 apply-edit-plan，生成单条可撤销事务。采用防重入引用在dispatch前清空。

EditPreview 使用 CanvasScene thumbnail 渲染真实图层、变换、内容及蒙版。候选仅有 layer-thumbnail-art，不会被正式导出的 .canvas-art 查询误取。前后切换仅切换独立候选视图输入。参数dx/dy/sx/sy/degrees/value按真实工具公开；每次用保存base和更新后步骤重建整个候选，不对旧效果叠加；候选ID保持不变。

候选保存文档ID及正式state引用revision，外部修改导致失效并禁用采用/微调；异步执行结果同样检查ID/revision。放弃、切模式、修改输入/范围、最小化均取消运行并清空候选；组件卸载abort。运行期间隐藏待确认计划，只保留有效运行取消入口。图像生成模式继续使用既有useImageGeneration。

## 验证结果与退出码

- 先失败：AIComposer.preview.test.tsx 初次验证缺少编辑效果预览，2项真实行为失败；另1项暴露既有导出重复xmlns，被归原导出任务修复（父独立review后done v27）。无绕过serializeExport。
- npm test -- --run src/creation/AIComposer.editPlan.test.tsx src/creation/AIComposer.preview.test.tsx src/ai/execution/preview.test.ts src/creation/ImageGeneration.test.tsx src/creation/ComposerLayout.test.tsx：exit 0，5 files / 27 tests passed。最终输出 /tmp/a11-final.log。
- npm run build：exit 0，151 modules；仅已有包体积/无效dynamic-import警告。
- vibeplan check：exit 0，检查通过，无待上传事件。

## 验收逐条映射

- 2f34e52f-5fcd-400c-be09-5e19d0b61adb：真实候选pixels!=base；前后切换像素随真实效果变化；生成、微调、放弃时正式state同引用、历史不变。运行中取消、重复执行、mode/minimize/prompt/scope放弃及切换文档测试无候选晚写。prompt本身属于既有可撤销编辑，测试比较该显式用户操作后的history，保证异步预览不额外写历史。
- 39a6c3bd-ca6d-4663-8122-fe194622ca49：采用前无“撤销本次编辑”，采用后单条undo；重复执行/重复采用不重复提交；undo layers==base且真实导出pixels==base；redo恢复候选pixels。
- c3e6145d-806d-4790-8ede-b9d2fbed1901：dx从10→30→20，最终位移20像素而非60；rotation仍15度；candidate.id不变；正式文档无写入。候选SVG及主画布均经过真实serializeExport(range:canvas)→Resvg：候选!=base，采用后export==候选，非空白对比。

## 文件

- src/ai/execution/preview.ts / preview.test.ts
- src/ai/ui/EditPreview.tsx / edit-preview.css
- src/creation/AIComposer.tsx
- src/creation/AIComposer.preview.test.tsx
- src/creation/AIComposer.editPlan.test.tsx：既有A10确认后测试增加显式采用，匹配A11新流程。
- docs/implementation/all-features-2026-11-14/a11-plan.md / a11-worker-result.md

## 边界与风险

revision采用保守state引用，停靠等UI修改也会使候选失效，需要放弃重建，保证不会覆盖并发编辑。参数错误通过统一notice/message显示，候选安全失效，不采用旧参数。候选放弃、替换或卸载释放JS引用，复用正式文档已有URL，不额外创建资源。此任务覆盖现有真实基础编辑工具的数值参数，无像素AI效果或收费模型新能力。没有已知未修复阻塞项。

## 独立预审修复

父代理发现args.op可覆写tool与隐式selection回退风险，先新增3项失败回归，再加入 executePreviewStep 统一校验：按真实EditorCommand字段白名单拒绝op/未知字段，必须显式layerId或非空layerIds，所有目标存在且在scope。Composer执行与参数重建共用校验，操作类型最后赋值。args.op=delete注入及scope外隐式delete/group均明确拒绝，正式base不变。修复后最终5files27tests、build、check exit0。
