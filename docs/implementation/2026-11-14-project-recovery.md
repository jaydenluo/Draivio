# F02 自动保存与恢复

任务6ed0827b-7695-4b62-a4c9-a32e9da456f0，基准171d5606201cc5c44f6292b35bcb5b7c27bc8fb2；本轮不提交推送。

## 实现

- IndexedDB `draivio-recovery-v2` 的 snapshots/assets 两个表，同一事务写资源、快照、裁剪每文档五份并清理无引用资源，transaction complete后才报成功。图片与小型SVG预览使用SHA-256内容键去重；手动保存基准只保留SHA256摘要，避免正文重复入库。localStorage只存启用偏好，不写图片或项目正文。
- 编码前领取代次token，单文档串行编码；持续编辑只替换pending，不使慢编码饥饿。900ms防抖、15s最大等待；切文档/同ID重开/关闭自动保存/丢弃会使旧token失效，并abort未提交事务。退回已保存状态会取消待存或在途的废弃版本。
- 自动保存状态独立于手动项目保存标记；自动保存不清除“未保存”。名称/手动保存基准通过仅本地生命周期事件同步。
- 启动展示多作品恢复记录、时间与预览；恢复时按新到旧逐份decode并真实Image解码校验，损坏快照回退并明确提示。恢复调用绑定发起session/revision，经过既有保存/放弃/取消切换确认；新副本生成新UUID、清空保存目标，防覆盖手动作品。loading AI结果标记为中断，不重发请求。
- 丢弃需要二次确认，仅在事务成功后移除列表；失败显示具体message与重试。开关和恢复列表入口位于状态区，界面保持紧凑。

## 实际验证

- `npx vitest run src/document/recoveryStore.test.ts src/document/recoveryScheduler.test.ts src/document/RecoveryControl.test.tsx src/document/ProjectFileControl.test.tsx src/document/ProjectClose.test.tsx --maxWorkers=2`：5文件28项通过（随后增加事务中途失败用例，recoveryStore单独5项通过）。
- `npm test -- --run --maxWorkers=4`：95文件468测试通过，exit0（早于最后增加的事务中途失败用例）。
- `npm run build`：通过exit0，既有chunk体积提示。
- IndexedDB在测试中由fake-indexeddb提供，真实事务complete/abort机制与新store实例读取、每文档裁剪、共享资源保留有专门测试；这不能替代原生Tauri强制终止重启验收。

## 独立审核补充

- 需求复核曾复现慢编码期间双计时器耗尽后的持续输入饥饿；已清理并重建防抖和周期计时器，精确回归先失败后通过，独立调度8项回归通过。
- 主代理在该补丁后执行全量95文件470测试、构建、Vibe Plan检查均exit0；随后质量复核发现慢恢复校验期间关闭/卸载取消缺少操作代次，正在补齐，需最终再次验证。

## 仍需独立验证

主代理已在独立 127.0.0.1:5198 测试源完成真实浏览器验收：更名并增加图层后显示保存成功，恢复列表有名称、时间、预览与两版本；另开全新 React 会话读取 IndexedDB 恢复记录；恢复前取消保留原文档，放弃一次性测试文档后成功恢复为四图层独立副本，名称带“恢复副本”，仍显示“未保存”。截图见 fixtures/recovery-browser-20261114/{saved-list,new-session-list,dirty-confirm,restored}.jpg。此证据为新会话读取，不能表述为强制进程终止/真实刷新通过；Tauri原生强制终止、系统磁盘配额及Windows运行未执行，不能由mock测试推断通过。自动保存依赖当前WebView的IndexedDB可写；不可用时保留手动项目并报告错误。已有localStorage旧恢复记录不自动迁移，因旧格式存在固定文档ID与未知payload；原数据不删除，避免误归属或数据丢失。

### 复审修复：异步恢复取消与确认期间编辑

- 恢复校验使用操作代次；关闭面板、卸载组件和发起新恢复使旧操作失效。失效操作不会派发恢复请求、弹出提示、执行成功回调或改写新操作的 busy 状态。
- 未保存确认结束后再次核对文档会话与 revision，确认期间继续编辑会取消旧恢复，提示重新恢复，保留当前作品。
- 回归证据：新增关闭、卸载、确认期间编辑三条测试，修复前全部失败（前两条实际仍派发一次恢复；第三条替换了文档身份），修复后通过；另覆盖关闭后重新恢复，旧校验返回时新请求仍保持 busy。
- 验证：`npx vitest run src/document/recoveryScheduler.test.ts src/document/recoveryStore.test.ts src/document/RecoveryControl.test.tsx src/document/ProjectFileControl.test.tsx src/document/ProjectClose.test.tsx --maxWorkers=2`：5 文件、34 测试通过，退出码 0。`npm run build`：退出码 0，保留现有大于 500 kB 分包提示。

- 二次复审补充：恢复请求携带可选 `isCurrent` 取消令牌，在未保存确认结束、实际派发 restore-project **之前**检查。确认期间关闭或卸载恢复面板后，即使再点“放弃修改”，旧请求也不会替换作品。新增两条精确回归，修复前均失败，修复后通过；上述五文件最新结果为 36 测试通过（退出码 0），构建通过（退出码 0）。

## 最终主代理验证

最终全部修复后：`npm test -- --run --maxWorkers=4` 95文件476测试通过exit0；`npm run build`通过exit0（既有chunk体积提示）；`vibeplan check`通过exit0；`git diff --check`通过exit0。需求与质量两阶段复核关闭所有已复现阻塞，质量外置两种原始取消复现2/2通过。原生强制终止、实际磁盘满和Windows未执行，仍按上文限制处理。
