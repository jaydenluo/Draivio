# 右侧工作区功能实现

用户确认实现右侧工作区中的四组核心能力：图层管理、选中对象属性、AI 结果操作、缩略图预览。

## 结构

操作面板现在有三个标签：

- 图层：图层列表、可见性、锁定、图层操作、不透明度和混合模式。
- 属性：选中图层的 X/Y、宽高、旋转、水平翻转和垂直翻转。
- AI 结果：显示由 AI 操作产生的结果图层，并提供“新增图层”和“替换当前”操作。

默认标签改为图层，保留原有 AI 对话框停靠逻辑。

## 图层管理

新增 reducer 操作：重命名、复制、删除、上下排序、锁定切换。锁定图层会阻止重命名、排序、不透明度、混合模式等编辑；仍可解锁。删除最后一个图层会被拒绝。复制图层生成未锁定副本并选中副本。所有变更进入既有撤销栈。

## 属性

属性面板通过 `commit-layer-transform` 写回已有 `TransformDraft`。输入值采用百分比坐标和百分比尺寸，与画布变换系统共用数据结构；旋转和翻转复用现有 SVG 变换渲染，因此面板改动与画布预览一致。

## AI 结果

AI 生成的图层通过 `aiOperation` 标记自动进入 AI 结果列表。新增图层复制结果图层，替换当前把结果的 source、thumbnail、transform、操作记录复制到目标图层；锁定目标图层时拒绝替换。结果暂时使用现有图层类型占位缩略图，真实 API 返回图像后可直接写入 `thumbnail`。

## 文件

- `src/state/editor.tsx`
- `src/state/layerWorkspace.test.ts`
- `src/layers/LayersPanel.tsx`
- `src/layers/PropertiesPanel.tsx`
- `src/layers/ResultsPanel.tsx`
- `src/components/Inspector.tsx`
- `src/creation/InspectorWorkspace.test.tsx`
- `src/styles/theme.css`

## 验证

- `npm test -- --run src/state/layerWorkspace.test.ts src/creation/Inspector.test.tsx src/creation/InspectorWorkspace.test.tsx`：3 个测试文件、12 项通过。
- `npm run build`：通过。
- 浏览器 localhost 实际查看属性标签和三标签右侧面板：通过；截图 `/tmp/draivio-right-workspace.png`。

## 后续接入点

真实生成接口返回图像后，将返回数据写入图层 `source` 与 `thumbnail`；当前 reducer 和结果面板已预留该路径。对象级文本和形状的独立属性编辑可在已有图层变换模型上继续扩展，目前面板以选中图层为统一入口。

## 继续实现记录

本轮继续补齐了工作区的可持续状态和交互：

- `Layer` 增加分组、子项、折叠、非破坏 `LayerAdjustments`；编辑器增加 `selectedLayerIds` 和独立 `aiResults`。
- 图层面板加入搜索、类型筛选、 Shift/Command 多选、批量隐藏/锁定/删除/分组、双击重命名、键盘快捷键和原生拖拽排序。
- 属性面板加入比例锁定、变换重置、角度规范化、锁定层禁用编辑和亮度/对比度/饱和度/色温/清晰度/模糊/阴影/高光调整。调整以参数存储，并在 SVG 画布层通过 CSS filter 预览，导出序列化仍使用同一画布树。
- AI 结果独立保存缩略图、源图、提示词、模型、服务来源、尺寸、时间、状态、收藏和采用标记；面板支持筛选、预览、收藏、删除、新增图层和替换当前图层。替换通过 reducer 快照保留撤销路径，锁定目标会拒绝替换。
- 模型来源增加 `supportsStrength` 能力字段；只有模型明确声明支持时才显示变化强度入口，避免跨模型伪造统一强度参数。

已验证：`npm run build` 通过；针对图层、属性、工作区和 AI 结果的测试通过。全量测试最后一次运行仍有旧兼容测试需要补齐结果面板的历史入口，正在修复后重新执行。

## 按钮布局优化（用户追加反馈）

- 图层操作统一 28px 高，按重命名、复制、上移、下移、删除排列。
- 属性翻转和重置使用等宽三列；比例锁定的复选框恢复紧凑横排；调整标题和全部重置对齐。
- AI 卡片操作改为两列，继续编辑独占一行；新增图层使用轻强调，删除悬停使用警示色。小于 290px 的面板使用单列结果卡片。
- 批量操作、结果筛选工具栏、重命名确认统一尺寸，并补齐键盘焦点样式。
- 改动文件：src/styles/theme.css、src/layers/ResultsPanel.tsx。
- 验证：npm run build 通过；工作区和 Inspector 相关 12 项测试通过。浏览器已检查图层与属性布局。
- 此记录只覆盖本次按钮布局调整，不扩大先前任务的功能验收结论。

## 属性与图像调整紧凑布局

用户反馈图像调整难发现，继续压缩属性面板高度：标签和数值同行，位置/尺寸两列；旋转与锁定比例同行；调整项两列四行。保留全部数字输入、拖动调节和名称，默认直接可见。极窄面板调整项回退单列。浏览器截图检查通过；npm run build 通过，InspectorWorkspace 与 NumericScrubber 共 6 项测试通过。改动：PropertiesPanel.tsx、theme.css；本次布局无剩余问题。

## 统一控件高度

按用户截图反馈，将右侧工作区搜索输入、下拉、数字输入外框和操作按钮统一为 28px。数字框从 20px 增高，数字字体调整到 12px；搜索及混合模式下拉从 34px 降低。不透明度和混合模式统一标签行与控件行，避免基线不齐。使用 --workspace-control-height 管理，排除复选框、滑块、文本域和缩略图。仅修改 theme.css；构建通过，浏览器检查图层面板对齐通过，无本次布局剩余问题。

### 24px 高度试用

用户要求从统一 28px 调到 24px，已修改共享变量，数字输入内部随外框调整为 22px。仅修改 theme.css；构建通过，浏览器截图确认搜索、筛选、操作按钮和图层数值/下拉均紧凑对齐。本次无剩余问题。
