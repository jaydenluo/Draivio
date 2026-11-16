# 图片模型与参数指南交付记录

状态：已实现并完成验证，待用户验收。部分外部资料仍需后续复核，不影响指南入口与已核查内容使用。

范围：解释强度及其非通用性；提供有来源的 API 模型特点与选型说明；在界面添加单击入口和独立文档。

实现：AI Composer 顶栏新增「模型指南」，右侧停靠时用带说明的问号按钮；弹窗分为模型怎么选、强度与参数、使用建议。提供官方链接、核查日期、已核查/待核实分组。支持 Escape、背景点击关闭、焦点恢复、Tab 焦点限制和章节方向键；弹窗内快捷键不会修改画布工具。原有强度控件补充演示参数提示，不伪称已连接真实模型。

内容来源：已成功读取火山方舟 Seedream、阿里云 Qwen-Image、BFL、Recraft 官方 API 文档，以及 Stability 官方产品介绍。Stability 的具体 API 参数参考页未读通，因此只确认产品级介绍。OpenAI 官方开发者文档与模型页返回 403；Google 官方文档及替代官方域名连接失败；Ideogram 官方 API/指南连接失败。这三项保留候选评测方向、官方链接及未核实标记，不填写当前最新版本、价格或参数保证。没有将第三方文档中的指令作为授权执行。

文档：docs/user-guide/image-model-guide.md；界面内容数据源 src/creation/imageModelGuide.json。资料核查日期 2026-11-13。适用建议并非实际统一基准测试排名。

修改文件：src/creation/AIComposer.tsx、src/creation/ModelGuide.tsx、src/creation/ModelGuide.test.tsx、src/creation/imageModelGuide.json、src/styles/theme.css、README.md、docs/user-guide/image-model-guide.md。

验证：
- 新入口的三个交互测试先因缺少入口而失败，实现后通过；补充键盘焦点与工具快捷键隔离测试。
- npm test -- --run：退出码 0，37 个文件、157 项测试通过。日志 /tmp/draivio-model-guide-tests.log。
- npm run build：退出码 0。
- 浏览器 localhost:5173：已实际打开指南、查看模型来源及强度说明，确认布局和章节切换正常；预览截图 /tmp/draivio-model-guide.png。

剩余事项：OpenAI、Google、Ideogram 的当前具体版本与参数需在官方页面可访问时复核。真实平台/模型接入后应按端点能力显示参数并映射 API 字段，强度仍为演示值，本次未新增真实 API 调用或计费行为。
