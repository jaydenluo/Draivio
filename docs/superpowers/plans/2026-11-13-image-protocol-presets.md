# 常见图片协议预设

用户要求添加模型时支持常见图片生成协议，并延续紧凑实用界面。按现有服务来源配置增加协议预设；同一来源中的模型共用协议，不同协议可建立独立来源。

- [x] 新增协议目录：OpenAI Images、Gemini generateContent、火山方舟 Images、通义万相多模态、BFL/FLUX、Stability、原生自定义。记录默认地址、鉴权方式、内容格式、请求路径、是否异步、文档入口和非计费测试能力，不硬编码最新模型。
- [x] 协议移到常用字段；平台选择带出推荐协议和默认地址，用户也能独立修改。切换协议只替换空地址或上一预设地址，保留用户自定义代理地址与密钥、模型。
- [x] 协议信息、测试能力与来源选择器保持同步；已有 openai_compatible/native 配置保持可读，不丢失数据。
- [x] Gemini 测试使用 x-goog-api-key 和 models 返回结构；OpenAI/火山兼容列表保留 Bearer。无非计费测试端点的协议明确禁用连接测试，允许保存配置，不伪造成功。
- [x] 浏览器与 Tauri 测试命令按同一协议语义工作。保存预设不等于真实生图适配器完成，现有生成仍为演示。
- [x] 验证预设切换、代理地址保留、鉴权/响应差异、旧数据兼容、保存重开、测试限制、前端全量测试、构建与 Rust 测试，记录结果。

## 实现记录

- 新增 `src/creation/imageProtocols.ts`：七类协议元数据与安全切换预设的公共逻辑。协议作为来源配置的一部分持久化，同一来源内的模型共用协议。
- 修改 `ServiceSourceSettings.tsx`、`service-settings.css`：紧凑协议下拉框；平台推荐预设；可展开接口说明；无免费测试协议禁用测试按钮并说明原因。
- 修改 `serviceConnections.ts`、`modelSources.ts` 与 `src-tauri/src/service_connections.rs`：协议校验、旧配置兼容、协议标签、Gemini/兼容接口各自的请求鉴权和列表结构，桌面端同步支持。
- 新增/扩展 `imageProtocols.test.ts`、`serviceConnections.test.ts`、`ServiceSourceSettings.test.tsx` 与 Rust 单元测试：覆盖默认地址切换、自定义代理保留、存储重开、免费测试限制、鉴权差异及返回结构。

## 验证证据

2026-11-13：
- `npm test -- --run`：46 个文件、184 项通过，exit 0。
- `npm run build`：TypeScript 和 Vite 构建通过，exit 0。
- `cargo test --lib`（src-tauri）：2 项通过，exit 0。
- `git diff --check`：通过，exit 0。
- `vibeplan check`：通过，exit 0；项目没有已授权任务，无云端任务状态更新。

## 来源与限制

官方 OpenAI、Gemini、火山、阿里云与 BFL 文档已读取接口路径；Stability 官方页面本次抓取因 TLS 错误失败，保留官方文档入口，未声明实测接通。模型 ID 保留用户填写，不声称存在某个最新模型。

本次完成协议配置、持久化与非计费连接测试分流。生成流程仍为演示，未实现各协议的实际生图、图片上传或异步轮询适配器；未使用真实密钥验证供应商账号，模型列表可访问不代表生图权限。自定义原生 API 作为旧配置兼容项保留，需要后续适配器才能执行。未自动提交或推送，保留工作区的其他修改。
