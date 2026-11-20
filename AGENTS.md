# AGENTS.md

<!-- VIBE PLAN MANAGED START -->
Before working on a task, read .vibe/instructions.md and the related task file.
When a user asks to add a task to Vibe Plan, follow the confirmation protocol in .vibe/instructions.md.
Update task status, changed files, tests, and remaining issues before reporting completion.
<!-- VIBE PLAN MANAGED END -->

## 弹窗与浮动窗口规范

- 所有应用内弹窗、对话框和浮动参数窗口必须支持拖动；标题在左，关闭按钮在标题栏最右侧，不能只有正文或底部关闭按钮。
- 优先复用 `FloatingSurface`；已有特殊布局使用 `DialogTitlebar` + `useDraggableDialog`。只添加标题栏不等于完成拖动接入。
- 仅标题栏空白与标题文字可发起拖动；关闭按钮、输入框、正文和其他交互控件不能触发窗口移动。使用 grab / grabbing 光标，支持鼠标与触控笔手势。
- 拖动实时移动窗口，保留原有定位方式，限制在可视区域内；窗口尺寸变化时仍须能够访问标题与关闭按钮。
- 关闭行为沿用业务语义；恢复编辑窗口关闭时仅收起、保留恢复副本。不可取消的处理过程中可禁用关闭按钮，不能静默丢失任务。
- 参数弹层同样遵循此规范。原生系统文件窗口由操作系统管理；普通菜单、tooltip 和页面内展开内容不视为弹窗。
- 新增或修改弹窗时验证标题拖动、右上角关闭、正文控件不误拖动与屏幕边界；不得为新窗口另造重复的拖动逻辑。
- 浮动窗口必须通过 Portal 挂载到 `document.body`（或统一浮层容器），避免被顶部栏、画布、工具栏的堆叠上下文、overflow 或 transform/translate 遮挡和改变定位。子对话框也必须独立挂载，不得嵌在可拖动父窗口内定位。
- 从按钮打开的工具窗口优先使用 `AnchoredWindow`，初始位置跟随触发按钮并限制在屏幕内，不能固定到页面最左侧。浮动窗口高于编辑界面，模态子窗口高于父窗口；Portal 子窗口的事件不能误触关闭或拖动父窗口。

## 复选框规范

- 应用内复选框统一复用 `src/ui/Checkbox.tsx`，不得直接新增裸 `<input type="checkbox">` 或用可点击 div 模拟；使用原生 checked/onChange/disabled、label 或 aria-label 保留键盘和读屏语义。
- 统一视觉尺寸为 14×14px，使用主题背景、边框和选中色；支持未选、选中、半选、禁用及 focus-visible。通过关联文字标签扩大点击范围，不放大方框本身。
- 通用文本输入样式必须排除 checkbox、radio、range，不能用 `width:100%`、输入框高度或 flex 拉伸复选框。页面不得自行覆盖 Checkbox 的尺寸、选中图案或颜色。
- 新增或修改含复选框的界面时，检查窄容器、标签换行、Space 切换、禁用与焦点轮廓；复用公共样式，不重复造局部修补规则。

## 工具参数栏滚动规范

- 所有工具顶部参数栏统一隐藏滚动条，包括横向和纵向；保留内容溢出时的鼠标滚轮、触控板滚动及键盘聚焦访问能力，不能用 `overflow:hidden` 替代隐藏滚动条。
- 复用 `.tool-options-controls` 的公共样式，同时覆盖标准 `scrollbar-width:none` 与 WebKit 滚动条；新增工具或独立参数组件不得重新显示滚动条。
