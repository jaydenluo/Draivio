# 统一请求与 message 提示实施计划

用户授权所有网络请求统一封装、所有请求提示统一使用 message。保留紧凑现有界面，不提交 Git，不改动其他 Vibe Plan 任务。

设计：传输层不直接弹提示，业务操作负责一次完整加载/结果 message，避免分页和并发多次弹出。前端 HTTP 统一超时、禁止重定向、错误脱敏、状态码及 Retry-After；供应商请求统一认证、地址和开发转发。Tauri invoke 统一适配，Rust 共用客户端/发送解析。开发模型列表和生图都通过同源转发，浏览器生产直连和桌面原生保留。

message 为全局顶部轻量通知，支持 loading/success/error/warning/info、按 key 更新、关闭、自动消失，显示于抽屉与弹窗之上。来源获取/测试/保存/启停使用它，失败不清空草稿。生成以整个批次为单位提示，保留局部进度和重试/未知结果确认；底层请求不自动重试有计费风险的 POST。

- [x] 先补 HTTP 安全/超时/响应错误、message 更新/关闭/去重、生成开发转发测试并观察失败。
- [x] 创建 src/lib/request.ts 与 native.ts，迁移 serviceConnections/openaiImages；dev 转发共用 HTTP 传输并支持生图，限制环回同源/方法/路径/请求体大小。
- [x] 创建 src/ui/message.ts、MessageHost.tsx 与样式；App 挂载，来源编辑/管理与生成改用 message；移除重复请求结果行内提示。
- [x] 合并 Rust 发送/响应处理，保留鉴权和计费语义。
- [x] 跑相关与全量测试、构建、Rust、diff/vibeplan check，浏览器检查弹窗上方通知和关闭后的消息；记录实际证据。

风险：未经真实密钥验证供应商权限；浏览器静态生产环境仍依赖供应商 CORS。加载通知关闭不代表取消已经提交的生图请求。只停止排队的既有行为保持。

状态：已实现并验证，待用户查看。未提交 Git，未变更其他 Vibe Plan 任务状态。


执行证据：
- 新增请求与 message 测试先因缺少实现失败；新增生图转发测试先返回404失败；新增弹窗内无障碍消息测试先因消息位于弹窗外失败。分别实现后通过。
- 相关8文件46项测试通过（后续新增1项无障碍测试）；最终全量 `npm test -- --run`：57文件235项全部通过，退出0。
- `npm run build`：通过，退出0（包括最终 MessageHost/AppShell 调整）。
- `cargo test --lib`（src-tauri）：5项通过，退出0。
- `git diff --check`、`vibeplan check`：通过，退出0。
- 静态检查确认 src/dev 中只有 src/lib/http.ts 直接 fetch，只有 src/lib/native.ts 直接 invoke；Rust 只有 network.rs 建客户端与 send().await。
- 浏览器 localhost:5173 已检查：来源编辑弹窗上的顶部错误 message 显示正常；修正后消息文字和关闭按钮进入当前模态无障碍树。使用空白表单触发本地密钥校验，未请求供应商、未读取或使用真实密钥，也未发起付费生图。
- 中途全量有3项提示可见性失败（独立挂载AppShell未挂MessageHost），已把唯一全局容器移至AppShell并重跑相关8项与全量，均通过。

主要变更：src/lib/http.ts、request.ts、native.ts；src/ui/message.ts；src/components/MessageHost.tsx与测试；src/styles/message.css；src/app/AppShell.tsx；TopBar通知桥接；ServiceSourceEditor/Settings与相关测试；serviceConnections/openaiImages/ImageGeneration；dev/providerRelay.ts与测试（由modelListRelay重命名）；vite.config.ts；src-tauri/src/network.rs/lib.rs/service_connections.rs；src/test/setup.ts；请求测试与docs/implementation/2026-11-13-unified-requests-message.md。

剩余边界：静态生产网页仍需供应商CORS或后端；本机开发生图转发仅用于已接入的OpenAI/兼容Images协议。供应商真实账户权限未验证。网络传输层不自动重试计费POST，未知结果仍需用户确认再生成。没有其他已知未处理问题。
