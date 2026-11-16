# 多文档标签实施计划

用户已要求实现多标签打开多个文档，沿用现有深色 Photoshop 式画布。Git 基线：171d5606201cc5c44f6292b35bcb5b7c27bc8fb2。保留工作区其他聊天的未提交变更。

## 范围与设计

- 画布顶部 32px 文档标签：名称、未保存点、关闭按钮和新建入口；超出宽度隐藏滚动条并支持滚动。打开项目不覆盖当前作品，新建进入独立标签。
- 文档宿主管理 session ID、元数据、文件位置、保存指纹及完整编辑状态；图层、文字、笔画、蒙版、选区、缩放/平移/旋转、提示词和撤销栈按文档隔离。一个活动画布，后台不保留画布 DOM；最多 16 个文档，达到上限明确反馈。
- 每份文档保留独立生成控制器；dispatch 绑定 session ID，后台结果仅写回原文档，关闭后忽略迟到结果并取消其排队。保存也捕获原 session 和指纹，保存期间的后续修改保持未保存。
- 关闭未保存文档提供保存并关闭、不保存、取消；保存失败/取消/保存期间继续修改均不关闭。最后一个标签关闭后提供新空白文档。窗口关闭检查所有文档。
- 本地工作区恢复保存多个项目数据与视图，重新启动时提示恢复，不保存 API Key 或临时文件 token。旧单文档恢复可作为新标签导入。
- 快捷键 Ctrl/Cmd+N 新建、Ctrl/Cmd+O 打开、Ctrl/Cmd+S 保存、Ctrl/Cmd+W 关闭、Ctrl+Tab/Shift+Ctrl+Tab 切换；编辑输入期间不抢占普通文字快捷键。

## 实施步骤

1. 先建立文档状态隔离和异步定向的失败测试，再添加 workspace reducer 与 Provider 接口。保留单文档 editorReducer API 供现有工具测试使用。
2. 将文件名称、保存路径、脏状态和保存/打开/窗口关闭管理从局部组件迁移到宿主；新建尺寸对话框接入新标签。
3. 接入标签条、关闭对话框、快捷键和本地多标签恢复。只挂载活动文档编辑 UI，后台生成控制器继续运行。
4. 处理切换后的临时工具预览取消、视图恢复和导出 DOM 查询，防止跨文档误写。
5. 运行针对测试、全量测试、构建、diff 与 Vibe Plan 检查；浏览器实际创建/切换/关闭标签并查看布局。

## 相关文件

`src/state/editor.tsx`、`src/document/documentWorkspace.ts` 与相关 Provider/测试、`ProjectFileControl.tsx`、`DocumentSizeControl.tsx`、`AppShell.tsx`、`CanvasViewport.tsx`、`ImageGeneration.tsx`、`theme.css`、工作区标签样式与恢复模块。

## 验收与风险

- A/B 使用不同尺寸和内容，切换后缩放/选区/撤销独立。
- A 保存或生成等待时切到 B，结果只能影响 A；A 关闭后迟到结果不重建 A。
- 打开多个项目保留当前脏文档；关闭取消保留文档；保存失败不关闭。
- 恢复多个标签且名称、尺寸、对象和视图一致；恢复文件位置不复用过期 token。
- 仅活动标签挂载 SVG/Canvas，明确 16 标签上限；不复制每份文档的全局 UI。
- F26 原范围还包含跨文档资源粘贴及内存预算验收，应根据本轮实际证据记录，不能以标签出现代替原 F26 所有验收。
- 原 F01/F02/R02 尚未验收时不自行解除其依赖或把 F26 标为完成；本轮实现及测试证据维护在此计划。

## 本轮实现结果

状态：用户要求的多标签主体已实现，F26 完整范围尚未完成，保留人工验收和上游依赖。

已实现：新建/打开/拖入项目新增标签；每文档状态与视图独立；绑定 session 的后台生成/保存；关闭取消和保存失败保护；本地多文档恢复；16 标签上限与仅活动画布 DOM。方向键及 Ctrl+Tab 切换保留焦点，关闭对话框限制焦点和底层快捷键。恢复数据校验尺寸。修复大尺寸文档固有宽高撑开 grid、导致画布偏移和被 Composer 遮挡的问题。

本轮改动文件：
- `src/document/documentWorkspace.ts`、`documentWorkspace.test.ts`
- `src/document/DocumentWorkspaceProvider.tsx`、`DocumentTabs.tsx`、`DocumentTabs.test.tsx`、`documentTabs.css`
- `src/document/workspaceRecovery.ts`、`ProjectFileControl.tsx`、`DocumentSizeControl.tsx`
- `src/state/editor.tsx`、`src/app/AppShell.tsx`、`src/canvas/CanvasViewport.tsx`、`src/styles/theme.css`
- `README.md`、本计划、F26 计划补记、截图及执行报告。

验证（均真实执行，退出码 0）：
- `npx vitest run`：83 文件、351 测试通过。新增多文档相关 12 项（reducer 4、组件 8），覆盖尺寸/选区/撤销隔离、后台保存/演示生成、关闭后迟到编辑、失败取消保存、恢复和键盘焦点。
- `npm run build`：TypeScript 与 Vite 构建通过；主 JS 约 697KB，存在超过 500KB 的分包提示，尚未做本轮之外的代码拆分。
- `git diff --check`：通过。
- `vibeplan check`：通过。
- 浏览器实测：恢复 A/B 两个标签，A 为 500×625 海报并有选区，B 为 1024×1024 透明画布、单图层；A/B 分别保留约 97% / 69% 缩放；关闭 B 后取消保留两个标签；DOM 仅一个 `.canvas-art`。
- 截图：`docs/implementation/screenshots/2026-11-14-document-tabs.jpg`。

验收映射：F26 标准 1、2 有上述自动化证据（生成测试使用演示响应，无真实付费服务）；标准 3 跨文档复制资源/重映射尚未实现；标准 4 恢复、关闭取消、后台不挂载画布已验证，但共享资源仓库和显式内存预算尚未实现。因此不宣称 F26 全部验收通过。

已知边界与下一步：
- F01/F02/R02 尚未验收；`task:start` 返回依赖阻塞，未解除依赖或自行验收。将本轮证据维护在计划及执行报告。
- 跨文档粘贴及资源 ID 重映射、共享资产内存预算后续按 F26 继续实施。
- 尚未执行 Windows/macOS 原生安装包和系统文件对话框实测；原生项目打开一次选一个，可重复打开进入多个标签；浏览器 fallback 和拖入支持批量。
- 恢复副本上限为 24Mi 字符、实际存储还受 WebView 配额限制，失败有提醒；恢复内容与视图但不恢复撤销栈、保存文件 token。大型作品应主动保存项目文件。
- 未修改 Rust，不自动提交、推送、部署或调用付费服务。

## 任务维护结果

云端 F26 已由 backlog 维护为 ready，当前版本 6。`task:start` 被未验收依赖拒绝；状态机不允许 backlog/ready 直接转 blocked，因此没有绕过状态机。`task:report` 返回“Only an active task can submit an execution report.”，执行报告完整保存在 `docs/implementation/2026-11-14-multi-document-report.json`，待上游验收、任务合法启动后提交；本次实现结果与检查证据已上传详细计划。未声明原 F26 完成。
