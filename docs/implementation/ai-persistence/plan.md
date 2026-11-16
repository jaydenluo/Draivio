# A30 AI 编辑记录持久化与离线恢复

授权：继续用户已确认全部任务；human 验收，不自行验收、提交或推送。
Git base: c30a9ba8e06832f75e321146f95c3a6b6bcd939f。共享工作区已有大量其他任务改动，逐文件追加本任务，不重置。

## 目标与设计
复用已验收配方与连续对话记录，不引入第二套重放引擎。项目 schema 升至 3，记录工具版本、已解析参数和来源；图层/蒙版/滤镜及生成候选仍引用同一资源表。打开和恢复只加载数据，不执行工具、不重发请求。旧 v1/v2 迁移保持可编辑内容。临时 blob/HTTP 图片必须物化为 data:image，失败则保存整体失败、原作品保留。敏感键/认证字段递归剔除，凭据样式字符串拒绝保存。

## 步骤与文件
1. 先建立 src/ai/persistence/editRecord.test.ts：真实配方/对话往返、workspace ID重绑后选择性撤销、blob嵌入与缺失失败、敏感字段、旧版、生成中断恢复。
2. src/ai/persistence/editRecord.ts：有限元数据版本、敏感信息边界、恢复中断标记；不包含可执行请求或自动重试回调。
3. src/document/projectFormat.ts：schema 3，保存时资源物化和敏感信息边界，载入时迁移/校验。既有 source/thumbnail/previewSource 字段覆盖候选、蒙版、结构逆操作；仅可达资源进入表以自然回收删除对象。
4. src/ai/conversation/session.ts 与 src/ai/recipes/runner.ts：生产运行写入工具版本/已解析参数；兼容旧记录；保持预览/取消/失败不写入采用记录。
5. src/document/workspaceRecovery.ts：恢复最终 session ID 后重绑连续对话；src/state/editor.tsx 接入恢复字段与新建清理，src/layers/ResultsPanel.tsx 显示中断提示，不提供隐式重发。
6. 新增集成用例验证恢复 UI/下载资源离线采用与后续手动微调、undo隔离；运行相关测试、全量测试、build、vibeplan check，交给独立审查。

## 验收映射
4275c278-7aaa-4134-8fb9-3210220dbda0：配方/对话/滤镜/蒙版/生成候选保存重开，恢复后选择性撤销与手动编辑。
c6db2e54-d576-4ed9-9b8a-fa0fac89ee15：递归敏感字段扫描，资源内嵌，临时地址不存入项目；缺失/下载失败不覆盖作品。
f6144d71-4e55-4327-8396-fd6de26d85c6：v1/v2迁移、无网采用已下载候选、恢复未完成任务提示且网络调用为零。

## 风险与边界
恢复本地缓存有现有24MiB上限，超限由message提示保存文件；不扩大到磁盘数据库。元数据未知工具版本只查看、不可隐式执行。不是新增图像算法，无付费模型调用。源文档中主动输入的文字/提示词不属于认证配置，但凭据样式不允许外泄。

## 当前状态
分析完成：服务恢复，任务v7/backlog依赖均清空。旧计划明确替换为上述代码级计划。下一步上传、ready/start、先跑失败测试。

## 2026-11-16 实施检查点（替换上面的初始状态）
- 实际入口已完成：projectFormat schema3保存/迁移、workspace恢复session重绑、ResultsPanel中断提示、EditRunSummary可展开参数、配方实际记录工具版本。
- 资源仅从可达source/thumbnail/previewSource/dataUrl物化，HTTP/blob下载缓存去重，非内嵌下载结果拒绝；删除不再引用候选则下次保存自动回收。原本有效候选在物化后重算revision，原本过期不刷新。
- 恢复store仅保留有效有限envelope，discard推进epoch以隔离旧延迟save；实际Provider仍通过decodeProject拒绝未来schema、损坏/缺失资源。两文档对话记录各重绑各自session。
- 已用真实ICC证实旧targetProfile.bytes序列化崩溃，现显式数组落盘并还原Uint8Array，校验和不变。
- 先失败回归证据：初始6项全部失败；后续有效增强候选失效1项失败；恢复坏envelope与discard竞态2项失败；目标ICC bytes.slice失败。均实现后转绿。
- 最终focused命令：npm test -- --run --maxWorkers=2 src/ai/persistence src/document/recoveryStore.test.ts src/document/projectFormat.test.ts src/document/DocumentTabs.test.tsx src/ai/conversation src/ai/recipes src/ai/ui/EditRunSummary.test.tsx src/color/softProof.test.ts，exit0，14 files/90 tests passed。日志/tmp/draivio-a30-focused.log。
- vibeplan check exit0，无待上传事件。
- 默认并发全量测试因与主控竞争导致像素suite超时，按主控指示中止exit130，非通过；日志/tmp/draivio-a30-full-tests.log。主控统一执行受控并发全量及build。
- 最近build exit1仅并行OCR artboards测试缺layerIds；本任务最初测试literal类型已修。不能据此宣称完整build通过。
- 代码冻结待主控全量与独立审查；未验收、未提交、未推送。恢复保留现有24MiB缓存上限和900ms防抖，最近未落快照瞬间状态不保证恢复。

## 集成修复与冻结
主控全量定位三例smartObjects保存失败与一例快捷键标签多匹配。根因不是validator过严，而是smartObjectState及两处内部文档投影继承父文档artboards.layerIds；源内容不包含这些外部层。已让smartObjectState为source自己的尺寸/层建立局部board，并让projectFormat/projectValidation复用，外部坏board和内部悬空layer引用仍严格拒绝。新增测试先复现继承问题再转绿。快捷键仅在“添加服务来源”dialog定位名称文本框。
独立审查预读发现v1 ICC数组未还原，新增回归先失败再修：v1 normalizeColorManagement；早期数字键对象仅连续有界字节可迁移，checksum仍校验，错误键/校验和拒绝。
最终冻结验证：npm test -- --run --maxWorkers=2 --testTimeout=30000 src/ai/persistence src/document/recoveryStore.test.ts src/document/projectFormat.test.ts src/document/DocumentTabs.test.tsx src/ai/conversation src/ai/recipes src/ai/ui/EditRunSummary.test.tsx src/color/softProof.test.ts src/document/smartObjects.test.ts src/state/smartObjects.test.ts src/tools/useToolShortcuts.test.tsx，exit0，17 files/114 tests；npx tsc -b exit0。日志/tmp/draivio-a30-freeze-tests.log、/tmp/draivio-a30-final-tsc.log。报告success草稿已准备但不上传，待主控最终全量与独立review；云v13保持testing，未验收。
