# Composer 菜单定位与模型参数核查

状态：实现及本地验证完成，等待用户查看。未绑定具体 Vibe Plan 任务 ID；没有云端任务状态变更。

## 菜单定位

根因：数量、模型、强度菜单使用共同的 right/bottom 固定偏移，比例菜单也相对整个 Composer 定位，没有使用触发按钮坐标。

改动：使用 ComposerPopover 挂载到 document.body，以实际按钮为锚点。浮动布局优先上方，右侧停靠优先下方；空间不足时翻转并限制视口边界、可用高度。监听滚动、窗口尺寸及菜单/按钮/Composer 的尺寸变化。统一外部点击、Escape 关闭与焦点恢复。模型内部菜单在各自字段下展开，避免被外层滚动容器裁掉。

文件：
- src/creation/ComposerPopover.tsx
- src/creation/ComposerPopover.test.tsx
- src/creation/AIComposer.tsx
- src/creation/OutputFormatPicker.tsx
- src/styles/theme.css

## 参数核查

用户要求先核查，未把强度控件重命名为质量。核实 Seedream optimize_prompt_options.mode、Qwen prompt_extend、FLUX.2 flex steps/guidance、Recraft imageToImage strength。新增界面模型指南内的具体参数示例及官方来源，并同步用户指南。

文件：
- src/creation/imageModelGuide.json
- src/creation/ModelGuide.tsx
- docs/user-guide/image-model-guide.md

官方文档范围：火山方舟图片生成 API、阿里云 Qwen-Image API、BFL FLUX.2 flex OpenAPI、Recraft image-to-image。OpenAI 页面访问拦截，Google、Stability API 参考页连接失败，相关字段仍待核实。未调用真实生成 API。

## 验证

- 先运行 ComposerPopover 回归测试：2 个测试均失败，复现所有菜单没有按钮锚点。
- 修复后定向测试：3 文件、7 测试通过。
- npm test -- --run src/creation：10 文件、33 测试通过。
- npm run build：退出码 0。
- npm test -- --run：41 文件、166 测试通过，退出码 0。
- 浏览器 localhost:5173：实际检查浮动数量菜单、模型菜单、右侧停靠比例菜单，以及更新后的模型指南；已恢复浮动布局。参数指南截图：/tmp/draivio-model-parameters.png。

## 剩余事项

当前强度仍是演示参数，未映射真实模型。建议下一步按平台、模型、具体端点和操作类型建立能力配置，分别显示质量、速度模式、编辑变化强度和高级参数；思考深度必须经官方字段核实后才显示。该能力适配未在本次研究中实现。

## 模型菜单精简（2026-11-13）

模型弹层改为“选择模型”标题，收紧弹层宽度、内边距、标签和选项行高；服务来源和模型仍保持两级结构，当前模型和可选模型继续清晰可见。`ModelSourcePicker` 新增 `compact` 展示模式，仅在 Composer 中启用，不影响其他使用位置。

验证：模型菜单浏览器截图 `/tmp/draivio-model-menu-compact.png`；相关测试 3 文件、6 测试通过；构建通过。
