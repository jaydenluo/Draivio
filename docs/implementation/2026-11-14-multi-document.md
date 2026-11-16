# 多文档标签与状态隔离：跨文档资源与预览预算补充

## 本轮实现

- `cloneDocumentContent(source, targetDocumentId)` 对文档内容做结构化深拷贝，并为图层、画布对象、蒙版笔画、AI 结果和场景顺序重映射 ID；图层层级、对象 `layerId`、AI 操作来源和结果 adoption 引用同步更新。
- `collectDocumentResourceReferences` 从图层、AI 结果、请求和 adoption 快照收集图片资源引用，按内容去重；资源字符串随目标文档复制，源文档关闭后目标仍持有独立数据。
- `createSharedPreviewCache(maxBytes)` 提供共享预览的 LRU 缓存，按 UTF-8 字节数统计并在写入后回收最旧条目，避免每个标签各自无限保留预览。

## 真实验证

`npx vitest run src/document/documentWorkspace.test.ts`：3/3 通过（跨文档 ID/引用重映射、资源引用去重、预算回收）。

`npx tsc --noEmit`：通过。

先运行专项测试时模块尚不存在，Vitest 正确报告 import resolution failure；随后实现接口并重新运行得到上述通过结果。现已接入最小 `DocumentWorkspaceProvider`/`DocumentTabs` 宿主：标签切换保存独立 `EditorState`，最多 16 个标签，最后标签关闭会创建空白标签；项目打开和新建在 workspace 下进入新标签，脏标签关闭提供取消、放弃和保存并关闭入口，保存并关闭复用 `ProjectFileControl` 的保存守卫，成功后才移除标签。

## 边界

这组接口不改变异步保存/生成的 session 与 revision guard；后台任务的跨标签完整回写仍需后续接入宿主。它也不替代现有 `duplicate-layer`（同文档复制）。缓存只管理字符串预览，不负责创建/撤销 Blob URL；调用方应在淘汰时释放其外部资源句柄。

## 2026-11-14 follow-up 验收与修复

本轮用户调整后重新验收并修复了宿主接入回归：旧的 `EditorProvider` 组件测试未包 workspace 时，标签栏现在安全不渲染；完整应用仍由 `DocumentWorkspaceProvider` 提供多文档能力。项目打开和新建在 workspace 中进入新标签；脏标签关闭提供取消、放弃修改并关闭、保存并关闭，保存成功后才移除标签。快捷键 Ctrl/Cmd+N、W、Tab/Shift+Tab 保留。

真实验证：

- `npm test -- --run`：102 个测试文件、570 项通过，退出码 0。
- `npm run build`：通过，退出码 0；Vite 仅提示主包超过 500KB。
- `npx tsc --noEmit`：通过，退出码 0。
- `vibeplan check`：通过，退出码 0。
- `git diff --check`：通过。
- 浏览器 `http://127.0.0.1:5198/`：点击“新建文档”后出现两个独立标签，第二个为活动标签；切换时活动状态正确，DOM 仍只显示活动画布。

本轮代码仍不宣称 F26 全部通过：跨文档复制入口尚未接入产品交互（纯函数已覆盖 ID 重映射与资源收集），多标签持久化恢复宿主与共享预览缓存尚未形成完整运行时链路；Windows/macOS 原生安装包验收也未执行。该任务保持人工验收所需的未验证状态。
