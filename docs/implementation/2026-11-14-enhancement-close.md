# 扣图与超分窗口关闭按钮

状态：已实现，待用户验收。

两个工具共用 EnhancementPanel，在标题栏右上角增加 SVG 关闭图标，提供关闭扣图窗口／关闭超分窗口的无障碍名称与悬停提示。点击切回选择工具，窗口随工具切换关闭。按钮不触发标题栏拖动。

修改文件：src/components/EnhancementPanel.tsx、src/components/enhancement-panel.css。

验证：npm test -- --run src/components/EnhancementPanel.test.tsx src/components/AppShell.test.tsx，5 个测试通过；npm run build 通过（存在包体积提示）。

剩余问题：无已知实现阻塞；待用户确认界面效果。未提交或合并。
