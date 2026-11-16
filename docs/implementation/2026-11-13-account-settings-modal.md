# 账户设置改为居中弹窗

状态：实现与本地验证完成。用户要求点击账户菜单后在弹窗中操作，原右上角窄面板太小。沿用简洁深色界面，不新增装饰或设置项。

改动：
- src/components/SettingsDialog.tsx：共享居中弹窗，遮罩、Esc/关闭按钮、Tab焦点约束、背景滚动锁定、关闭后焦点恢复。
- src/creation/ServiceSourceSettings.tsx：服务来源使用共享弹窗，原有配置、测试、保存及生成设置沿用。
- src/components/TopBar.tsx：账户菜单保留入口，服务来源和云服务充值点击后关闭菜单并打开独立弹窗。
- src/styles/service-settings.css：宽680px且适配窄屏；标题16px、字段13px、输入34px、按钮32px；长内容在弹窗内部滚动。

验证（2026-11-13）：
- npm test -- --run src/creation/ServiceSourceSettings.test.tsx src/components/ButtonAudit.test.tsx src/tools/useToolShortcuts.test.tsx：3个文件16项通过，exit 0。
- npm run build：通过，exit 0。
- git diff --check：通过，exit 0。
- vibeplan check：通过，exit 0。本次未绑定云端任务，不修改其他任务。
- 浏览器：检查服务来源新增表单及充值弹窗居中显示；验证Esc关闭充值弹窗、焦点回到账户按钮。未保存密钥，未提交充值。

剩余限制：本次只改变展示容器与交互，充值沿用原有演示逻辑，未接入支付。无自动提交或推送，保留其他工作区修改。
