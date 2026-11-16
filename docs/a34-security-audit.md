# A34 代码级安全审计与先红契约

2026-11-14，只读审计；最新任务 `f869d0b1-e563-4ac4-8269-adddd115221a` v7/backlog/human。未执行攻击、未修改源码、未更改任务状态。本文不是安全验收结论。

## 当前执行与资源边界

`src/creation/AIComposer.tsx:78` 本地 planNaturalLanguage → PlanExecutor → executePreviewStep → executeEditorCommand → reducer。chat adapter 尚未接入 Composer。executePreviewStep 已检查工具字段白名单、明确目标及scope，reducer检查有效锁定；没有通用shell/文件/HTTP工具，不能声称提示词能直接执行系统命令。

`src/lib/http.ts` 已拒绝redirect，支持timeout+abort、流式64MB响应限制、丢弃供应商错误正文；Rust network.rs禁redirect且丢弃错误正文，但成功response.json尚无字节上限。

## 可达的rename→save网络副作用

`src/ai/execution/preview.ts executePreviewStep` 允许rename的name字符串；`src/ai/tools/editorTools.ts actionFor` 写入层名。若名称为 `https://127.0.0.1:8765/private`，采用后保存项目：`src/document/projectFormat.ts materializeSources` 递归处理所有字符串，将任何HTTP(S)字符串判为图像；defaultFetchAsset直接fetch。prompt等文本字段同样可达。

这与用户授权下载真实source资源不同：层名称/提示词中的URL是文字，不能因保存动作自动成为资源下载授权。最小修复是按明确schema资源字段物化，文本保持原文；真正远程资源仍按用户授权处理，并统一大小、重定向、类型/来源规则。

先红契约：通过真实executePreviewStep(rename)产生draft，采用后encodeProject，注入fetchAsset spy；断言name/prompt URL原样保存且spy零调用。另设真实layer.source URL断言仍下载并转asset，防止通过禁止所有远程资源使测试表面通过。

## 凭据与输出边界

chatAdapter.containsSecret只检查对象键；content或{name:测试sentinel}回显凭据不会被检测。parseChatResponse返回完整raw和未约束usage。PlanExecutor直接将handler错误/result写runState并emit。projectFormat只删除顶层apiKey，不能证明嵌套回显不会保存。

最小接线：凭据只在连接/请求边界；adapter返回允许字段DTO，去掉raw；依据本次实际key值精确脱敏，usage仅有限数字；公共executor错误/结果边界限制字段、深度、长度并脱敏。先红使用人为测试sentinel，不读取实际key；恶意成功响应、参数、result/error、UI与encodeProject输出都扫描该sentinel。

## 公共执行策略缺口

- parseJsonPlan仅op字符串与32步粗校验，且格式与实际{tool,args}不一致；local planner/executor并无统一32步限制。
- scale有限正数乘已有宽度可溢出Infinity；rename/数组/目标/复制后对象总量没有预算。
- createRunState普通对象字典接受__proto__等保留ID，可能改变原型/跳过Object.values统计。
- requestProviderJson.path仅TS union，无运行时集合断言；当前模型不能直接调用它，但后续接线不能用cast替代验证。

最小方案：adapter/local计划统一严格PlanStep schema，工具枚举/字段/类型/有限范围/深度字节/步骤依赖预算；preview/run及每步执行都检查，操作后几何与对象资源总量再次验证。字典用Map或null原型并拒绝保留ID。先红覆盖超长计划、巨大缩放、保留ID、未知工具、额外op/URL/path、跨scope目标、预览后祖先锁定，失败时文档/history不变。

## 真正云图像链上的上传拒绝

真实链 `ImageGeneration.start → ImageBatch → generateOpenAIImages → requestProviderJson/native`。当前没有用户拒绝上传的入口。只添加孤立policy helper不能验收。

在start建立batch前展示供应商/模型、文档或层或选区范围、是否发送图像；允许取消本次。批准绑定session documentId、revision、scope/target/selection及来源配置版本。仅发送captureRenderedEditorContext裁剪PNG，不发整个EditorState。retry/refreshContext改变范围或来源必须重新批准，不能静默扩大范围。

先红组件契约：取消后provider/native调用数零、无结果/history；批准selection后payload只含selection PNG；改内容/切文档/换来源/重试不能复用过期批准。无真实付费调用。

## 资源响应补充契约

Rust成功chunked响应超限应中断而非response.json无限读取。parseImageResponse接受任意HTTP(S)URL及任意长度base64；后续下载须受控、解码后有像素预算。使用本地测试服务或固定编码样例验证大小、重定向、伪图片与像素预算，不发送网络攻击。

以上待实施与验证；不得把这些设计当作已经修复或测试通过。
