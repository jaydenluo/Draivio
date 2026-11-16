# 服务来源抽屉与模型选择

## 模型顺序调整（已实现）

用户要求获取列表后勾选模型不要置顶或改变顺序。ServiceSourceEditor.tsx 改为先按 availableModels 原始顺序展示，再追加接口未返回的手动模型；选中状态独立更新。现有 ServiceSourceSettings.test.tsx 的11项测试通过，git diff --check通过（均退出0）。无剩余问题，未提交Git。

用户已明确授权：右侧抽屉、列表内部滚动、编辑独立弹窗、供应商模型获取与勾选。保持现有简洁风格；不提交Git，不修改其他任务。

1. SettingsDialog 支持 drawer 变体和顶层对话框焦点管理；抽屉列表 flex/min-height:0/overflow:auto，编辑弹窗覆盖抽屉且底层不可操作。Esc仅关闭最上层，关闭恢复焦点。
2. ServiceSourceSettings 管理列表；抽取 ServiceSourceEditor 管理连接/模型/生成设置。允许先保存空models来源，选择器禁用无模型来源，避免取models[0]崩溃。
3. 新增 fetchConnectionModels：OpenAI/火山 data[].id，Gemini models[].name（去models/前缀）；认证/超时/重定向与现有连接测试一致，支持有界分页和去重。Rust提供同语义命令，测试与列表获取共用实现。不支持列表的协议保留手动输入与明确提示。
4. 编辑弹窗获取列表、搜索、勾选/批量选当前筛选；与手动ID输入同步。刷新保留选择，未列出的原模型也保留；只有保存后修改当前来源。异步回调不更新已关闭编辑器。
5. 先写配置/分页/选择与嵌套弹窗测试，再实现；验证前端全套、构建、Rust测试、diff和vibeplan检查，浏览器检查抽屉/编辑布局。禁止真实付费调用。

状态：本次功能已实现并验证，待用户查看。未提交 Git；未修改其他 Vibe Plan 任务状态。

实现文件：
- src/components/SettingsDialog.tsx：抽屉变体、叠层 Escape/焦点/滚动锁。
- src/creation/ServiceSourceSettings.tsx、ServiceSourceEditor.tsx：抽屉列表与独立编辑弹窗，模型获取、搜索、勾选、手动输入和选择保留。
- src/creation/serviceConnections.ts、src-tauri/src/service_connections.rs、src-tauri/src/lib.rs：浏览器与桌面模型列表接口、分页去重及注册。
- src/creation/ModelSourcePicker.tsx：禁用尚未选择模型的来源。
- src/styles/service-settings.css：固定抽屉头尾、内部列表滚动、模型列表样式；修复全局输入样式撑大复选框的问题。
- 对应 ServiceSourceSettings、ModelSourcePicker、serviceConnections 测试。

验证证据：
- npm test -- --run src/creation/serviceConnections.test.ts src/creation/ServiceSourceSettings.test.tsx src/creation/ModelSourcePicker.test.tsx：24/24 通过，退出 0。覆盖模型分页/去重、选择保存、获取失败保留选择、关闭编辑器忽略迟到响应、无模型来源禁用、嵌套 Escape。
- cargo test --lib（src-tauri）：5/5 通过，退出 0。
- npm run build：通过，退出 0（含最终复选框 CSS 修正）。
- git diff --check：通过，退出 0。
- vibeplan check：通过，退出 0，无待上传事件。
- 浏览器 localhost:5173：已确认右侧全高抽屉、正确列表排版、添加来源独立居中弹窗、Escape 仅关闭编辑器并返回抽屉。未操作现有真实密钥、未发送供应商请求。
- 最新全量 npm test -- --run：219/220 通过，退出 1；失败为 src/creation/Inspector.test.tsx 的 keeps the submitted scope and intent when the user changes them during execution，图层 aria-pressed 预期 true 实际 false。该部分有并行工作区改动，本次未修改。之前一次全量的 layerWorkspace 调整测试失败在最新运行已不再出现。

边界与剩余事项：不提供列表接口的协议保留手动模型 ID；浏览器请求仍受供应商 CORS 限制。模型列表可能包含聊天模型，提示用户勾选实际支持的生图模型。未提供真实测试账号，供应商连通性未实测。工作区其他功能的全量测试失败需由对应工作处理。

## 后续修复：tokenfls 浏览器获取列表失败

用户反馈 https://api.tokenfls.com/v1 提示无法连接。实测不带密钥 GET /v1/models 返回 401；带 localhost Origin、Authorization 预检头的 OPTIONS 返回 403 且无跨域允许头，确认浏览器跨域请求受阻。旧提示将网络异常和实际超时混为一谈。

修复：dev/modelListRelay.ts 提供仅开发模式启用、仅同源且本机环回可用的模型列表转发；限定 GET /models 和支持的协议，仅转发认证头，禁止重定向、不转发 Cookie、不记录密钥。src/creation/serviceConnections.ts 在 localhost 开发模式使用同源转发，桌面原生路径不变，静态网页仍直接请求。分开显示真实超时、本机上游网络错误及浏览器网络/跨域失败。vite.config.ts 注册插件；package.json/package-lock.json 增加 Node 类型、tsconfig.node.json 声明 Node 类型。

验证：先观察新增测试因缺少转发与超时分类而失败，修复后 npm test -- --run dev/modelListRelay.test.ts src/creation/serviceConnections.test.ts src/creation/ServiceSourceSettings.test.tsx src/creation/ModelSourcePicker.test.tsx 为 29/29 通过，退出 0；npm run build 与 git diff --check 均退出 0。用明确无效的测试密钥访问本机同源转发到 tokenfls，得到预期 401，验证可收到供应商响应而非被浏览器 CORS 阻断。未读取或使用用户真实密钥，也未调用生图接口。此转发只解决本机开发网页模型列表；生产静态网页需供应商允许 CORS 或服务端接入，浏览器生图接口未在此次修复范围。未提交 Git。
