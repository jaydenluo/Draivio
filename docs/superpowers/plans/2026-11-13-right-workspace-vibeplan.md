# 右侧工作区与 AI 结果工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完整实现 Draivio 右侧图层、属性、AI 结果及基础图像处理工作区。

**Architecture:** 继续使用 React + `editorReducer` 单一状态源。图层模型保存可见性、锁定、缩略图、变换、分组、调整参数和 AI 结果元数据；右侧 Inspector 只负责面板呈现和用户事件，CanvasScene 负责把状态渲染到画布。AI 结果候选单独存储，采用时才创建正式图层。

**Tech Stack:** React, TypeScript, Vitest, Testing Library, SVG/CSS。

---

## 阶段一：稳定右侧工作区和图层数据模型

- [ ] 为 Layer 增加 locked、thumbnail、groupId、children、adjustments 等字段，并为 AIResult 建立独立类型。
- [ ] 为 editorReducer 增加选中、重命名、复制、删除、排序、分组、锁定、批量操作和撤销恢复动作。
- [ ] 先写 reducer 测试：最后一个图层保护、锁定阻止编辑、复制生成独立 ID、排序边界、分组折叠和撤销重做。
- [ ] 更新 LayersPanel：搜索、类型筛选、缩略图、锁定/隐藏状态、分组折叠、拖拽插入线和批量选择工具栏。
- [ ] 加入键盘快捷键：Delete 删除、Cmd/Ctrl+D 复制、Cmd/Ctrl+Shift+G 分组、上下方向键排序，并在锁定或无效时给出状态提示。
- [ ] 运行图层 reducer、LayersPanel、历史和导出测试。

## 阶段二：属性面板和上下文编辑

- [ ] 将 TransformDraft 的数值输入抽成受控字段，增加比例锁定、重置变换、角度规范化和 0–100 坐标边界校验。
- [ ] 为图片、文字、形状提供上下文属性：图片显示变换和透明度，文字增加文本/字号/颜色/对齐入口，形状增加颜色/描边入口。
- [ ] 将属性提交映射到既有 CanvasScene、TextObject 和 Shape 渲染，不复制第二套变换逻辑。
- [ ] 先写非法输入、宽高联动、重置、旋转/翻转和撤销测试，再实现 UI。
- [ ] 验证选中对象、画布预览和 SVG 导出保持一致。

## 阶段三：AI 结果候选和采用流程

- [ ] 把生成结果从正式 layers 中抽出为 `aiResults`，保存 id、thumbnail/source、prompt、model、source、size、createdAt、status、favorite、adopted、error。
- [ ] 更新模拟生成：成功、部分失败、空结果和加载失败都生成可测试状态；真实 API 返回时同时写 source 和 thumbnail。
- [ ] 实现 ResultsPanel：缩略图网格、筛选（全部/本次/已采用/未采用）、参数详情、放大预览、继续编辑、收藏、删除。
- [ ] 实现两格/四格比较和选择胜出版本。
- [ ] 实现“新增图层”和“替换当前图层”；替换前保留旧图层，锁定目标拒绝替换，所有动作进入撤销栈。
- [ ] 先写 reducer 和组件测试覆盖元数据、筛选、采用、替换、删除和部分失败，再接 UI。

## 阶段四：多选、批量和结果效率

- [ ] 增加 selectedLayerIds 和批量操作栏，支持 Shift/Command 多选。
- [ ] 实现批量隐藏、锁定、删除、分组；分组支持展开/折叠和拖入/拖出。
- [ ] 实现拖拽排序的可访问键盘替代，并显示明确插入位置。
- [ ] 添加图层类型/状态筛选和 AI 结果筛选，保持筛选不影响实际选中状态。
- [ ] 添加双击重命名、快捷键帮助和锁定/隐藏的文字状态。
- [ ] 补齐多选批量操作和键盘交互测试。

## 阶段五：非破坏图像调整

- [ ] 建立 `LayerAdjustments` 类型，包含 brightness、contrast、saturation、temperature、sharpness、blur、shadows、highlights，默认值为中性值。
- [ ] 在属性/调整区域提供数字输入和滑块、单项重置、全部重置、预览开关；调整存储在图层状态而不是直接覆盖 source。
- [ ] CanvasScene 使用 SVG filter 或明确的导出处理路径应用调整；documentIO 导出时移除编辑覆盖层但保留调整效果。
- [ ] 对调整范围、撤销重做、导出和性能边界写测试。
- [ ] 模型专属参数按能力配置显示，避免统一 strength/quality/steps 滑杆。

## 阶段六：整体验收和文档

- [ ] 更新右侧工作区帮助文案、空状态、错误状态和操作提示。
- [ ] 运行全量 Vitest、TypeScript build 和浏览器验收：浮动/停靠 Composer、选区、图层标签、属性编辑、AI 结果采用和导出。
- [ ] 检查无障碍：标签名称、键盘焦点、可见锁定状态、Escape 关闭预览和对比面板。
- [ ] 更新 `docs/implementation/`，记录改动文件、测试、已知限制和真实 API 接入点。
- [ ] 使用真实测试结果生成 Vibe Plan report，逐条映射八项验收标准。

## 用户追加反馈：按钮布局

已优化图层、属性、AI 结果、批量操作的按钮高度、排列和窄面板换行。主要操作优先，删除放末尾，保持原有功能。改动位于 theme.css 和 ResultsPanel.tsx；构建与相关 12 项交互测试通过。本轮没有新增功能阻塞，功能完整性仍以原计划逐项验收为准。

## 用户追加反馈：属性与调整节省空间

已完成标签/数字同行、位置尺寸两列、旋转/比例锁定同行、八项调整两列四行。区域默认展开，以避免图像调整难发现；260px 以下调整项使用单列。已浏览器检查，构建及相关 6 项测试通过。涉及 PropertiesPanel.tsx、theme.css；本次布局无剩余问题。

## 用户追加反馈：统一控件高度

已将右侧表单控件和操作按钮统一为 28px，缩小搜索与下拉框，增高数字框并适度放大数字，统一不透明度/混合模式标签与控件基线。theme.css 使用共享高度变量。构建及浏览器布局检查通过，无本次布局剩余问题。

### 24px 控件试用

按用户要求，共享控件高度从 28px 调为 24px。theme.css 单变量调整，构建和浏览器检查通过；本次无剩余问题。
