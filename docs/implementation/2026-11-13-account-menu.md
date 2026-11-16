# 账户下拉菜单调整

状态：实现与本地验证完成。用户要求加宽菜单、增加每项间距，标题配图标和简短说明，并增加退出登录。

改动文件：src/components/TopBar.tsx、src/styles/theme.css。

- 菜单宽320px，每项最小高度70px，外内边距14/12px，项间距8px。
- 服务来源：平台/密钥/模型说明与线性服务图标；云服务充值：积分方案说明与卡片图标。
- 退出登录独立分隔，配退出图标和说明；项目无真实登录服务，按钮暂禁用并明确说明，不伪造会话退出。
- 保留服务来源和充值居中弹窗。添加菜单外点击关闭、Esc关闭并恢复头像焦点、打开时聚焦首项。

验证：
- npm test -- --run src/components/ButtonAudit.test.tsx src/tools/useToolShortcuts.test.tsx：2文件9项通过，exit 0。
- npm run build：通过，exit 0。
- git diff --check、vibeplan check：均通过，exit 0。本次无绑定任务，不更新其他云端任务。
- 浏览器：确认账户菜单图标、说明、间距、退出禁用提示实际显示正常。

剩余事项：真实退出登录依赖后续账户登录和会话服务。未改动用户配置或提交充值，未自动提交/推送Git，保留其他工作区修改。
