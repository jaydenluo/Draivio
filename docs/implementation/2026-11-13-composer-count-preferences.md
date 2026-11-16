# 默认数量与选择记忆

状态：已实现并验证，待用户验收。

需求：首次默认 1 张，记住用户上次选择的数量。

实现：初始状态数量改为 1 张；EditorProvider 初始化时读取本机 localStorage 的 draivio-generation-count，仅恢复 1、2、3、4、6、8 张中的合法值；数量变化后保存，刷新或重新打开时恢复。无记录、记录损坏或浏览器存储不可用时回退到 1 张，存储写入失败不影响当前会话选择。测试间隔离该偏好记录。

修改文件：src/state/editor.tsx、src/creation/AIComposer.tsx、src/creation/composerPreferences.ts、src/creation/ComposerPreferences.test.tsx、src/test/setup.ts、README.md。

验证：新增 4 项测试先失败、实现后通过；npm test -- --run 退出码 0，38 个文件、161 项测试通过；npm run build 退出码 0。

剩余事项：无已知未完成项；偏好保存在本机当前站点，不跨设备同步。
