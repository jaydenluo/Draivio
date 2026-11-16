# 模型搜索选择器

用户已批准：取消来源/模型两级下拉，使用一个全来源搜索、按来源分组的紧凑模型列表。点击模型同时确定来源和模型并关闭；保持来源与模型原顺序，选中只打勾。列表内部滚动、搜索与管理入口固定。底部模型按钮增加来源小字和完整名称悬停提示；计费说明改为配置来源名称，避免将中转误标为官方计费。

- [x] 更新选择器行为测试，验证跨来源搜索、同名模型来源区分、一次选中并关闭、空/停用来源、稳定顺序。
- [x] 重写 ModelSourcePicker，迁移 AIComposer/GenerationPanel 共用并收敛 props，清理旧两栏样式。
- [x] 修正来源计费文案与底部按钮排版；更新受交互变更影响的已有测试。
- [x] 相关/全量测试、构建、diff和vibeplan检查；浏览器观察实际菜单。记录结果，不提交Git或修改其他Vibe Plan任务。

状态：已实现并验证，待用户查看。


实现：ModelSourcePicker.tsx 改为搜索+分组平铺列表，支持上下方向键，当前选中仅打勾；AIComposer.tsx 选择后关闭整个菜单，模型按钮分两行显示名称/来源并保留完整名称title；GenerationPanel复用相同组件。modelSources.ts计费按配置来源名称显示；新增src/styles/model-picker.css，移除theme.css中的旧两栏/嵌套菜单样式。更新ModelSourcePicker、ServiceSourceSettings、ComposerLayout、Inspector测试。

验证：新增4项选择器用例先因旧交互失败，迁移后通过。一次测试误以image-不会匹配云端，但云端ID为image-pro等，本来就应按ID匹配；修正空结果用例查询shared-image。最终npm test -- --run为57文件237项全部通过、退出0；npm run build通过、退出0；git diff --check与vibeplan check均通过、退出0。

浏览器：已观察全部来源在同一列表内、搜索框自动聚焦、模型列表内部滚动且管理入口固定；输入sunburst后仅留下两个相关自定义模型，选择gpt-image-2.6-sunburst后菜单关闭，按钮显示该模型与tokenfls，计费提示切换为供应商计费。没有读取/修改密钥或发起模型/生图网络请求。

无已知剩余问题；模型仍来自用户启用和保存的配置，未擅自按模型名称推断生图能力。未提交Git、未修改其他Vibe Plan任务。

### 紧凑度调整

用户要求进一步缩小行距。已将模型行最小高度34px调整为28px，垂直内边距7px改4px，行距1.4改1.3；减少面板、分组标题/分隔、搜索下方和底部管理入口留白。仅修改src/styles/model-picker.css及本计划，保留字体大小和模型顺序。

验证：git diff --check、vibeplan check通过（退出0）。npm run build退出1，当前并行编辑中的src/document/ProjectFileControl.tsx存在ProjectMetadata导出和ProjectDocument/EditorState类型错误，src/engine/raster/rasterWorker.ts存在WorkerGlobalScope类型错误；与本次CSS调整无关，未修改这些文件。构建日志：/tmp/draivio-model-picker-compact-build.log。未新增样式镜像测试。
