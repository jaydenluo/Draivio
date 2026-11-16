# R03 AI 候选与采用修复

任务：92116dc7-a664-47f2-918e-8afa9d501a98。仅在隔离工作树实施；远端状态由主代理维护。未 commit、push、调用付费生图 API 或访问实际凭证。

## 范围与实现

- 真实 ImageBatch 的 onImage 回调只追加未采用候选，保持正式 layers、选中层和工作区标签不变。每次提交创建 batchId，重试沿用批次；“本次”严格按当前 batchId，而非时间窗口。
- 模拟完成生成内置有效 PNG（四种离线几何图），source/thumbnail 均可展示，状态为 success，不再永久 loading 或创建空正式层。
- 新增采用使用 UUID 独立图层，保存 aiOperation 与 candidate.adoptions；替换记录 originalLayer 的深快照，沿用 R01 祖先锁定校验，拒绝直接替换组。新增、替换、候选删除收藏均通过既有 canonical history；不改 history wrapper。
- 完整 source 用于放大/比较；比较 2–4 个候选，可展示生成来源原图及替换前原图并选择胜出版本新增图层。fixture 原图使用实际 CanvasFixtureContent，并非演示图替身。
- 继续编辑一次恢复来源、模型、模式、prompt、完整参数、原 sourceLayerId 和选区；源层删除时明确提示选择新来源。
- 缩略图失效先回退 source，source 加载失败标记 error 并禁止采用。部分成功、取消、空返回都不生成正式占位层。
- 异步回调附 expectedDocumentId；文档变化清除 demo timer、取消旧队列，旧请求结果/反馈不污染新文档。
- projectFormat 的资源枚举窄扩展到 request.sourceImage、layer.aiOperation.sourceImage、adoptions.originalLayer.source/thumbnail/aiOperation.sourceImage；保存内嵌、下载去重、离线恢复及缺失资源拒绝复用 F01 现有门禁。未更改 metadata whitelist、validation gate 或 fingerprint。
- 按主代理追加修复 TopBar 导出假成功：仅打开对话框不提示成功，实际下载回调后才通知。

## 本包改动文件

- src/creation/ImageGeneration.tsx
- src/creation/ImageGeneration.test.tsx
- src/creation/AIResult.test.ts
- src/creation/demoImage.ts
- src/creation/Inspector.test.tsx（旧自动采用断言改为候选及不写正式层断言）
- src/creation/OutputFormat.test.tsx（格式捕获现在断言候选 request）
- src/creation/ServiceSourceSettings.test.tsx（来源捕获现在断言候选 request，保留凭证不泄露断言）
- src/layers/ResultsPanel.tsx
- src/layers/ResultsPanel.test.tsx
- src/layers/ResultsPanel.css
- src/state/editor.tsx：仅 R03 类型、动作与 reducer 分支，以及 new-document 清理本次批次字段；保留并行 R02 wrapper 与 F01 lifecycle。
- src/document/projectFormat.ts：仅 imageFields 枚举新增关联资源
- src/document/projectFormat.test.ts
- src/components/TopBar.tsx：仅移除打开导出对话框时假成功
- src/components/ButtonAudit.test.tsx：验证无假成功及实际下载后成功
- 本文档。

## 实际验证

RED：

- `npm test -- --run src/creation/AIResult.test.ts src/creation/ImageGeneration.test.tsx`：退出 1，6 失败/2 通过；准确复现真实与模拟自动创建正式层、无采用关系、参数恢复缺失。
- `npm test -- --run src/layers/ResultsPanel.test.tsx`：初始退出 1，4 失败；复现时间筛选、缩略图代替 full source、缺原图/胜出采用、参数恢复缺口。追加加载失败测试再次退出 1（候选未转 error），修复后通过。
- `npm test -- --run src/document/projectFormat.test.ts`：退出 1，13 通过/1 失败，新增嵌套来源未下载、未内嵌；修复后通过。
- `npm test -- --run src/components/ButtonAudit.test.tsx`：退出 1，准确捕获打开对话框即宣称已导出；修复后通过。
- 文档切换后立即再次模拟的测试先退出 1（旧 timer 阻塞新任务），修复后通过。

GREEN：

- `npm test -- --run src/creation/AIResult.test.ts src/creation/ImageGeneration.test.tsx src/layers/ResultsPanel.test.tsx src/creation/InspectorWorkspace.test.tsx src/state/layerWorkspace.test.ts`：当时 33 项，退出 0。
- `npm test -- --run src/document/projectFormat.test.ts src/creation/AIResult.test.ts src/creation/ImageGeneration.test.tsx src/layers/ResultsPanel.test.tsx`：当时 27 项，退出 0。
- `npm test -- --run src/components/ButtonAudit.test.tsx src/creation/Inspector.test.tsx src/creation/OutputFormat.test.tsx src/creation/ServiceSourceSettings.test.tsx src/creation/ImageGeneration.test.tsx`：33 项，退出 0。
- `npm test -- --run src/layers/ResultsPanel.test.tsx`：最新 6 项，退出 0。
- 冻结前 `npm test -- --run src/creation/AIResult.test.ts src/creation/ImageGeneration.test.tsx src/layers/ResultsPanel.test.tsx src/document/projectFormat.test.ts --maxWorkers=4`：34 项，退出 0（含 R04 validator 补完后的项目格式测试）。
- `npm run build`：退出 0；Vite 提示主 bundle 大于 500 kB，非失败。
- 第一次全量 `npm test -- --run`：退出 1，404 通过/7 失败；7 个旧自动写正式图层断言已按候选规范更新并加强无自动采用断言，对应定向测试全部通过。二次全量退出 1，415 通过/1 失败（416 项）；唯一失败为并行 R04 新增的 adjustmentsEnabled 类型校验 RED 阶段用例，主代理确认 R04 随后已补 validator。日志 `/tmp/draivio-r03-full-tests.log`。本代理不重跑全量，由主代理稳定快照整合验收。
- `vibeplan check`：退出 0，checks passed，无待上传事件；未执行远端任务 mutation。

## 手工验收

1. 本地云端模拟提交 2/4 张；等待结束，正式层数与当前选中对象不变。切到 AI 结果看真实可见缩略图、非 loading，新增后才出现图层。
2. 运行两批，切“本次”仅见第二批；“已采用/未采用”随采用正确变化。取消排队/失败后查看进度且无空正式层。
3. 勾选 2–4 个候选比较，观察 full source 与来源原图；采用胜出版本只新增该图层；Escape 关闭，焦点回到此前控件。
4. 点击继续编辑，检查服务、模型、全部尺寸/比例/数量/强度、模式、提示词、选区恢复。真实服务被删除时须重新配置（不会保存凭证）。
5. 替换图片、撤销/重做；原始内容与参数恢复；锁定层/锁定祖先/组禁用替换。删除候选后已采用层仍存在。
6. 带候选/采用关系保存项目、离线重开，比较原图仍可显示。打开导出对话框不出现成功消息，真正下载 SVG 后才提示已导出。

## 剩余与边界

- 真实接口测试通过 mocked fetch 驱动实际适配器/ImageBatch/provider/reducer，不等于已调用付费供应商；未执行付费请求。
- 浏览器原生图片解码、比较视觉布局、离线保存后的实际浏览器显示需主代理浏览器验收；jsdom 不证明位图结果。
- 真实图像编辑接口仍按现有能力明确阻止；继续编辑恢复输入，不扩展供应商编辑协议。
- 本次 batchId 为会话筛选指针，候选持久保存 batchId；重开项目后“本次”为空，直到新生成。生成失败详情保留在现有批次进度中，不制造没有 source 的正式层。
- 替换前 Layer 常驻候选采用关系与撤销历史；删除候选后保留已采用正式层，原始图可在历史容量范围撤销，不额外创建隐藏备份层。

## 独立复核退回后的修复（第二次冻结）

首次实现未覆盖 same-ID 重新打开及非法 nested adoption 元数据。主代理独立复核为 SPEC FAIL；首次定向通过和 416 项全量通过均不作为这两个漏测项的证据。已追加以下修复，替代上文仅 documentId guard 的决定。

### 文档会话与异步生成

新增运行期 `documentSessionId`：Provider 初始创建、new-document、每次 restore-project（即使 documentId 相同）生成全新值；普通编辑、同批候选到达、撤销/重做不改变。该字段不进入项目格式 whitelist、fingerprint 或 DocumentSnapshot，旧项目没有该字段仍可打开。

Provider 按 session 变化取消旧队列、清 demo timer、移除旧批次/重试 UI，旧 callback 和 finally 都携带 expectedDocumentSessionId；旧会话不发反馈，不清除新会话 busy 状态。按主代理明确授权，在现有 editorReducer expectedDocumentId/expectedRevision guard 旁窄加 session guard，使过期动作在事务和文档写入前被拒绝；不改变 R02 history wrapper 其余逻辑。R03 reducer 的异步分支也保留防御校验。

### 非法采用关系导入

将现有 Layer 字段校验抽为共享 validateLayer，同时供正式 layers 与 adoption.originalLayer 使用，保留 R04 的 finite/adjustmentsEnabled boolean 校验。校验 adoptions 为数组、每项为对象、kind 为 add/replace、layerId 非空、replace 必须有完整 originalLayer；原层仍校验 transform/adjustments/visible/opacity/source/children 等全部结构。脱离当前文档的原层 groupId/children 不强制引用当前 live layers，但不得自引用或 children 重复。operation 新增 batchId/sourceImage 及 result.batchId 类型校验。

非法项目在 decode/validate 阶段即被拒绝，实际 ProjectFileControl 测试证明作品名称和文档 revision 保持原样，不进入切换确认或 restore。

本次增加改动文件：`src/document/projectValidation.ts`、`src/document/ProjectFileControl.test.tsx`；其余为上文 R03 文件窄改。

### 新增真实测试结果

- RED `npm test -- --run src/creation/ImageGeneration.test.tsx --maxWorkers=4`：退出 1，2 失败/8 通过；延迟真实请求 same-ID restore 后仍有旧队列、demo timer 阻塞新任务。普通编辑后同批 4 个结果仍完成的策略用例已通过。
- RED `npm test -- --run src/document/projectFormat.test.ts --maxWorkers=4`：退出 1，1 失败/15 通过；准确捕获 `adoptions: ''` 被接受。
- GREEN `npm test -- --run src/creation/ImageGeneration.test.tsx src/document/projectFormat.test.ts --maxWorkers=4`：26 项，退出 0；同 ID 旧真实回调、demo、retry UI 已隔离；原层完整结构及新增字段非法值均拒绝。
- GREEN `npm test -- --run src/creation/AIResult.test.ts src/document/ProjectFileControl.test.tsx --maxWorkers=4`：17 项，退出 0；包含 malformed adoption 实际文件打开保持当前作品，以及过期动作不 flush 活动事务。
- 最终 GREEN `npm test -- --run src/creation/AIResult.test.ts src/creation/ImageGeneration.test.tsx src/layers/ResultsPanel.test.tsx src/document/projectFormat.test.ts src/document/ProjectFileControl.test.tsx src/state/documentHistory.test.ts src/document/projectLifecycle.test.ts --maxWorkers=4`：7 文件、63 项，退出 0。
- 最终 `npm run build`：退出 0，仍仅 500 kB bundle 提示。

补充手工验收：生成未返回时重开同一已保存作品，检查进度消失并可立即重新提交；旧响应到达时不得新增候选/改忙碌状态。编辑提示词后等待同批多结果，全部仍写候选，prompt 及请求参数保留提交时值。导入含 malformed adoptions 的文件应报错并保留当前作品。

### 二次复核 P2 收尾：旧 finally 不派发过期通知

第二次独立复核其余 SPEC 通过，发现旧真实请求 finally 仍派发 set-generating；虽然 wrapper 拒绝文档写入，但会产生“文档或版本已更改”的 notice 覆盖新会话消息。新增真实延迟 component 用例：新会话开始模拟并处于活动数值事务时，旧请求完成，busy、notice、historyTransaction 和 revision 均必须不变。

- RED `npm test -- --run src/creation/ImageGeneration.test.tsx --maxWorkers=4`：退出 1，1 失败/9 通过，notice 实际为“文档或版本已更改，已放弃过期操作”，预期“新会话正在编辑”。
- 修复仅 ImageGeneration：finally、真实 onImage、demo timer callback 都在 dispatch 前同时校验 mounted、documentId、documentSessionId；旧会话无意义动作不再触发通用拒绝通知。保留 reducer token 门禁处理其他入口。
- GREEN `npm test -- --run src/creation/ImageGeneration.test.tsx src/creation/AIResult.test.ts src/state/documentHistory.test.ts --maxWorkers=4`：3 文件 29 项，退出 0。按主代理要求本次不再并行启动全量测试。
