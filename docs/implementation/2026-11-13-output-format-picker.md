# 合并比例与分辨率选择器

状态：功能已实现并完成相关测试及浏览器检查，待用户验收；全项目检查仍有画布模块错误。

需求：尺寸与比例合并为一个入口；固定常用比例，每个比例下提供常见分辨率；提供 Auto。

实现：用单个「比例与分辨率」入口替代两个按钮。弹层左侧选择 1:1、4:3、3:4、3:2、2:3、16:9、9:16、4:5；右侧显示对应三档像素尺寸和 Auto 自动分辨率。顶部提供完整 Auto。点击分辨率后一次性保存比例和尺寸、关闭弹层；只浏览比例不会修改提交参数。支持 Escape、外部点击关闭、撤销/重做、停靠保留设置，提交时保存参数快照。浮动位置向上展开，右侧停靠向下展开。

修改文件：src/creation/AIComposer.tsx、src/creation/OutputFormatPicker.tsx、src/creation/outputFormats.ts、src/creation/OutputFormat.test.tsx、src/creation/outputFormats.test.ts、src/state/editor.tsx、src/styles/theme.css、README.md。

验证：
- 新增交互测试先运行，3 项因缺少合并入口而失败；实现后通过。
- npm test -- --run src/creation：退出码 0，5 个文件、16 项测试通过。
- 浏览器 localhost:5173：确认 16:9 展示 1280 × 720、1920 × 1080、2560 × 1440，选中 1920 × 1080 后入口同步显示；浮动和右侧停靠布局正常。
- npm test -- --run：退出码 1，119 通过、16 失败，失败涉及画布场景、笔刷、蒙版、路径和工具快捷键等模块。完整输出 /tmp/draivio-output-format-tests.log。
- npm run build：退出码 1，BrushScene.test.tsx 的 objectsByLayer 属性与 BrushScene 组件类型不匹配；CanvasViewport.tsx 访问 BrushStroke 不存在的 x/y 字段。这些画布文件未在本次修改。

剩余事项：需修复画布模块的全量测试与类型错误后才能宣称项目整体通过。分辨率是产品预设，真实平台模型接入时需验证支持的尺寸，Auto 在此保存为自动参数，不伪造实际输出分辨率。
