# 工具参数栏隐藏滚动条

用户要求：顶部工具参数放不下时不显示滚动条，鼠标滚轮仍可滚动。

范围：仅 `ToolOptionsBar` 和 `.tool-options-controls`，保留现有参数与画布缩放行为。

实施：保留 `overflow-x:auto`，通过标准及 WebKit 样式隐藏滚动条；普通纵向滚轮在参数溢出时转换成横向滚动，触控板原生横向滚动继续有效，Ctrl/Meta 组合不转换；监听器随组件卸载清理。

验证：运行现有工具选项组件测试、生产构建及差异检查；记录实际结果后交付。此为独立界面微调，不启动或完成 F14 文字工具升级任务。

状态：已实现并验证。

改动文件：`src/components/ToolOptionsBar.tsx`、`src/styles/theme.css` 和本记录。溢出时转换纵向滚轮并阻止该事件继续触发数值输入的滚轮调整。

验证结果：

- 浏览器中贝塞尔路径参数栏实际 scrollWidth=928、clientWidth=830，滚动条计算样式为 none；向下滚轮后 scrollLeft 从 0 增加到 98.33，反向滚轮回到 0；羽化值保持 0。
- `npx vitest run src/components/ToolOptionsBar.test.tsx src/components/NumericScrubber.test.tsx`：退出码 0，2 文件、6 项测试通过。
- `npm run build`：退出码 0。
- `git diff --check`：退出码 0。
- `vibeplan check`：退出码 0。
- 预览截图：`docs/implementation/screenshots/2026-11-14-tool-options-scroll.jpg`。

剩余问题：本次请求范围内无已知问题；Windows/macOS 原生 WebView 未分别实测。
