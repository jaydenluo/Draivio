# OpenAI 批量生成执行计划

基线 HEAD：171d560。用户已授权当前设计；保留已有其他修改，不自动提交。

1. 配置：为 ServiceConnection 增加可选 generation/modelGeneration；旧数据兼容；校验枚举和并发；服务来源紧凑接口设置，按模型覆盖。测试旧数据默认值、覆盖与保存。
2. 请求适配：独立 OpenAI Images payload/响应解析，浏览器 fetch 与 Tauri invoke；桌面新增生成命令，限制 HTTP(S) 地址/协议，禁用重定向，180秒超时。测试 body 参数省略/鉴权/非200分类/base64和URL/异常响应。
3. 队列：独立批次控制器，按实际返回图片推进每个槽位；并发上限、429 降速、部分结果、取消排队、明确失败补齐和未知结果显式确认。测试以 deferred promises 控制并发，不真实计费。
4. 界面：共享 useImageGeneration 状态供 AIComposer/GenerationPanel；逐张 append-ai-result 到 reducer；紧凑进度、取消、重试状态；未实现真实编辑明确提示。原云端演示保留。
5. 验证：先红后绿的配置/请求/队列/集成测试，npm test -- --run，npm run build，cargo test --lib，git diff --check，vibeplan check；记录实际结果与限制。没有绑定任务ID，不创建云端任务。

状态：实现与本地验证完成，等待用户实际账号验收。


## 完成记录与验收证据（2026-11-13）

- 配置：generationOptions.ts 定义来源默认与模型覆盖，serviceConnections.ts 校验并兼容旧数据；ServiceSourceSettings.tsx 的“生成设置”提供单次/分次、1–4并发、尺寸发送开关、画质省略或显式值、模型恢复来源默认。桌面 SQLite JSON 结构保留新增配置。
- 请求：openaiImages.ts 实现真实 POST /images/generations，单次多图发送 n，分次省略 n 默认一张；按配置省略 size/quality。浏览器 fetch 与 Rust generate_openai_images 命令均禁用重定向并设置180秒超时。Rust 经已保存来源ID读取密钥。
- 任务：imageBatch.ts 限制并发、429降至1并遵守 Retry-After（秒数或HTTP日期，上限60秒），取消唤醒冷却队列但继续接收已发送结果。默认不自动重试。保留少图与部分坏响应中的有效图片；未返回为missing，坏图片或网络/5xx为unknown。未知结果重发须二次点击明确可能重复计费。
- 界面：ImageGeneration.tsx 在 EditorProvider 内共享批次；AIComposer、GenerationPanel 使用同一入口，配置参数保持一致，尺寸不发送时标示“由服务决定”。逐张 append-ai-result 写入画布、图层、历史和 AI 结果；请求意图冻结，密钥不进入编辑器/批次状态。真实图片编辑阻止执行，真实来源的参考图入口暂禁用。
- 只读审查：发现并修复部分坏响应丢失有效图片和桌面日期型Retry-After问题，回归复查无剩余重要发现。
- 浏览器检查：localhost 服务来源→添加→生成设置→分次生成，确认默认并发2与紧凑布局。未填写或保存真实密钥，未发起付费生成。

实际检查（全部 exit 0）：
- npm test -- --run：53个文件，207项通过。
- npm run build：TypeScript与Vite构建通过。
- cargo test --lib（src-tauri）：4项通过，包含配置往返、请求鉴权与HTTP日期限流。
- git diff --check：通过。
- vibeplan check：通过；目前项目存在另一条右侧工作区待规划任务，本次无绑定任务ID，不修改其状态。

过程中全量测试曾发现其他工作区修改导致图层“正片叠底”选项不匹配；未修改该功能，当前工作区后续版本已通过该测试。

## 改动文件

新增：src/creation/generationOptions.ts、generationOptions.test.ts、openaiImages.ts、openaiImages.test.ts、imageBatch.ts、imageBatch.test.ts、ImageGeneration.tsx、ImageGeneration.test.tsx，以及本设计/计划文档。

修改：src/creation/serviceConnections.ts、ServiceSourceSettings.tsx、ServiceSourceSettings.test.tsx、AIComposer.tsx、GenerationPanel.tsx；src/state/editor.tsx；src/styles/service-settings.css、theme.css；src-tauri/src/service_connections.rs、lib.rs；src-tauri/Cargo.toml、Cargo.lock（httpdate依赖）。保留同文件中已有工作；未提交或推送。

## 剩余限制

- 未使用用户真实 key 向 OpenAI 或 sub2api 进行付费验证；供应商权限、模型ID、参数支持仍需账号实测。
- 本次接入 OpenAI Images / 火山兼容 Images 文生图路径；其他协议和图片编辑未实现。云端仍为既有演示，不宣称积分生图服务已接通。
- 浏览器直连受供应商CORS限制；桌面由Rust发送请求。
- URL响应作为结果图片地址使用，供应商签名URL可能到期；本次未新增下载归档或项目持久化功能。
- 取消不撤销已发出的付费请求；未知结果不自动补发。新的批次会替换进度显示，已成功图片保留在图层/结果中。
