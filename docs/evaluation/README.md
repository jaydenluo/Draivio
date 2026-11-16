# AI 编辑评测与回放

当前语料版本 `zh-layer-1.1.0` 有 **159 条中文指令，其中 63 条复合指令，覆盖 17 个已发布 AI 工具**。其中原始 `zh-layer-1.0.0` 的 150 条（90 条单工具、60 条复合）及其 oracle 保持不变，另加 6 条高斯滤镜和 3 条色温调整案例，均有独立结果断言。覆盖范围按当前发布工具目录核对，不把工具栏的所有绘画工具虚构成模型可调用能力。

历史 150 条基准覆盖六个不同目标、边界不透明度、正负角度、缩放、两种翻转、六种对齐、子集分布及十种操作组合。数据保存目标 ID、工具顺序、精确枚举和数字容差，以及独立的文档结果断言。语料是人工设计的参数/目标变体基准，不代表自然语言分布或真实照片质量。

所有几何图片由 `fixture.ts` 原创生成，按 CC0 提供；不下载、不使用第三方人像。固定 100×100 文档、六个非对称彩色 PNG 对象、锁定底图，避免字体和外部资源差异。

## 离线执行与回归

```sh
npm test -- --run src/ai/evaluation
node scripts/evaluation/replay.mjs --report /tmp/draivio-evaluation.json
node scripts/evaluation/replay.mjs --report /tmp/draivio-regression.json --baseline docs/evaluation/local-replay.json
node scripts/evaluation/replay.mjs --report /tmp/draivio-release-gate.json --planning-gate
```

默认不覆盖已有报告；显式 `--overwrite` 才可覆盖。回归命令要求相同语料摘要和模式，阻止先前通过的规划案例倒退。发布门槛命令对 90% 规划目标作真正的失败退出。

四项指标分开记录：

- **规划**：把实际本地 `planNaturalLanguage` 输出与人工预期比对，检查工具、顺序、目标、参数范围、额外参数、依赖和额外破坏性步骤。此处不是 mock，也不是模型证据。修复前报告 120/150（80%）：混合模式不支持、分组/分布扩大到全部对象、部分全选对齐措辞未解析等共 30 例失败逐条保存在 `baseline-before-planner-fix.json`。修复后实际本地解析器达到 150/150（100%）；通用修复复用发布混合模式表、按每个明确名称解析集合并拒绝缺失/歧义目标、在单目标解析前处理全选对齐，没有将 oracle 当作实际预测。独立最小回归见 `planner.test.ts`。
- **执行**：直接回放人工 oracle 命令，经真实 `PlanExecutor` → `executeTransaction` → `executeEditorCommand` → `editorReducer`，独立断言结果、输入不变及撤销/重做；150/150。它证明确定性工具契约，不代表失败的规划已经执行正确。
- **像素保护**：每例用实际 `CanvasScene` 和 resvg 渲染，检查固定左下角 16 个保护像素；150/150。另有全部 15 种工具针对锁定目标时的全图 10,000 像素不变断言，以及预览/取消/失败不污染文档测试。生产契约允许复制锁定源，测试检查源不变且不改变此固定图的渲染。保护区域是这个基准的明确范围，不代表任意照片任意蒙版的泛化保证。
- **视觉质量**：`not_run`，真实生成样例 0/30；必须另走双人人工评审，不能用像素相似度、离线夹具或本地规划率替代。

以上 150/150、15 工具及 80%→100% 是历史 `zh-layer-1.0.0` 指标；当前 159 条本地规划、执行、保护像素均为 159/159，当前证据见 `docs/implementation/final-integration-2026-11-16/evaluation-replay.json`，仍不是真实模型质量。

`docs/evaluation/local-replay.json` 是历史 150 条的一次真实本地执行报告，含语料摘要、Git 基线、时间、零调用成本、所有逐例结果及失败原因；它没有宣称付费模型调用。代码变动后应另存新的报告，不把旧报告当作当前测试结果。

## 导入已授权真实模型预测

本工具不发送网络请求，也不读取服务密钥。真实调用需要另行授权，通过项目既有请求封装采集完整结果；不得手填 oracle 冒充输出。保存如下 JSON（`predictions` 必须包含当前语料的全部 159 个案例，不可用历史 150 条预测文件代替，每个值是未经替换的实际步骤数组）：

```json
{
  "metadata": {
    "mode": "real-model-import",
    "provider": "实际服务",
    "model": "精确模型ID",
    "modelRevision": "服务返回的不可变版本/快照",
    "requestConfig": {"temperature": 0, "seed": 42},
    "promptSha256": "实际系统提示词的SHA256",
    "runId": "实际采集批次ID",
    "gitRevision": "实际代码提交",
    "authorizationReference": "用户授权记录引用",
    "cost": {"amount": 0, "currency": "USD", "inputTokens": 0, "outputTokens": 0}
  },
  "predictions": {"zh-001": [{"id":"s0","tool":"move","args":{"layerId":"subject","dx":5,"dy":0},"dependsOn":[]}]}
}
```

示例字段不是执行证据；成本填实测值，零成本只在真实服务确为零时使用。用 `node scripts/evaluation/replay.mjs --plans ACTUAL_RUN.json --report REPORT.json` 导入；缺案例、缺元数据或规划率低于 90% 会退出失败并保留报告。真实模型规划指标仍与 oracle 执行指标分开。导入方需保留原始请求/响应及计费凭据；工具无法认证来源真实性。

## 30 例双人独立评审

先准备至少 30 份真实生成结果（不同输出摘要、不同服务请求 ID），一个 JSON 清单 `{ "schemaVersion": 1, "artifacts": [...] }`。每项必须有 `caseId`、`prompt`、相对于清单的 `inputPath`/`outputPath`、实际文件的 `inputSha256`/`outputSha256`，及 `provenance`：`mode: "real-generation"`、`provider`、`model`、`modelRevision`、`requestConfig`、`requestId`、`createdAt`、`authorizationReference`、`cost: { amount, currency }`。原图、结果图必须与指令对应；维护者先审核真实性和使用许可。重复输出、重复请求、缺失 provenance 或哈希不匹配会拒绝。此工具验证完整性，无法替人核验服务收据真实性。

```sh
node --experimental-strip-types scripts/evaluation/review.mjs init generation-manifest.json /tmp/human-reviews
node --experimental-strip-types scripts/evaluation/review.mjs aggregate generation-manifest.json /tmp/human-reviews/review-a.json /tmp/human-reviews/review-b.json /tmp/human-review-report.json
```

初始化产生两个**空白**评审文件，绝不预填通过。两位真人分别查看原图、指令和同一结果，不看对方评分，填写真实 `reviewerId`、`reviewedAt`、`independent: true`，并独立对 `intent`（意图符合）、`preservation`（主体/保护区域保持）、`artifacts`（接缝/变形/伪影）打 1–5 分，填写 `pass`/`fail` 和具体 `notes`。1=不可用，2=明显缺陷，3=满足要求但有可接受小缺陷，4=良好，5=优秀；任何维度低于 3 不能标通过。两人不同结论记为分歧，不自动仲裁为通过；第三人复核可另留决议，不改原始独立评分。

聚合拒绝同一 reviewer 的重复条目、三人混入、不同输出哈希和未填表，输出双通过率、分歧率、缺失案例、原始评分及 30 例完整性。身份和独立性的真实性由人工负责。未达到 30 个完整双评案例退出非零；0 例的通过率为 `null`。没有真实生成和真人评分时，只交付流程与离线测试，不声称满足该验收项。

## 当前验收缺口

语料与本地确定性回放已交付。真实模型 ≥90% 规划率尚无授权调用证据；本地解析器由 80% 提升为 100%，前后完整报告已保留，这仍不能替代真实服务规划率；30 例真实生成双人评审尚未开展。当前任务应保留这些待办，不能依据本地测试通过自动接受整项任务。


## 历史基准与当前语料

当前 `zh-layer-1.1.0` 的 159 条包含原始 150 条、6 条高斯滤镜及3 条色温案例，其中63 条复合，覆盖17 个工具。历史 `docs/evaluation/local-replay.json` 与当前语料摘要不同，不能直接作为同语料回归基线。使用当前语料的真实回放报告作为后续基线；保留历史报告以追溯修复，不覆盖原始证据。
