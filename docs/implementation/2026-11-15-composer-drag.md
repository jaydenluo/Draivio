# AI 输入框拖动与底边吸附

用户要求：悬浮 AI 输入框可拖动，靠近底边吸附，避开操作提示和右下角控件。

实现：顶部空白区域为拖动区域，按钮/表单不触发拖动；使用 pointer capture 保持拖动连续。距离底部停靠线 24px 内吸附，停靠线距画布底部 56px（原 26px）；左右和顶部保留 12px。拖动取消恢复原位置。ResizeObserver 在面板和画布尺寸改变后重新约束位置，底部吸附状态保持。停靠右侧时禁用拖动。位置属于界面状态，不进入作品撤销或项目文件。

文件：AIComposer.tsx、useComposerDrag.ts、composerPosition.ts、theme.css 及对应测试。

验证：
- npx vitest run src/creation/useComposerDrag.test.tsx src/creation/composerPosition.test.ts src/creation/ComposerLayout.test.tsx --maxWorkers=2：3 文件、5 项通过。
- npm run build：通过，保留既有 chunk size 提示。
- git diff --check：通过。

未进行本轮真实浏览器拖动人工验收；自动化测试覆盖拖动、吸附、边界、取消、按钮排除以及既有停靠/最小化草稿保留流程。

## 用户追加：收起仍可输入与发送

收起只隐藏模型/尺寸/数量等参数，保留共享 textarea 和独立发送按钮；输入草稿在展开/收起和右侧/悬浮切换时保留，发送复用原有生成入口及禁用条件，生成进度在两种模式下均可见。收起输入高度 34px，最多 80px，顶部拖动区域保持可用。

验证：ComposerLayout、useComposerDrag、ComposerPopover 共 5 项通过；ComposerCompact 2 项通过（实际调用现有 start 入口、生成中禁止重复发送）；npm run build、git diff --check、vibeplan check 通过。未调用真实 API。
