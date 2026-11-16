# A02：AI 工具协议与执行注册表

任务：e3ac5120-efde-4c7f-b053-a7a0826eaff5。Git 基线 171d5606201cc5c44f6292b35bcb5b7c27bc8fb2；没有提交或推送。

## 实现边界

首版发布三个真实本地命令：`layer.adjustment@1`、`layer.transform@1`、`layer.rename@1`。它们复用既有 editorReducer 的历史、锁定、渲染和项目保存行为。未注册主体识别、修复、模型调用等未实现工具，不把 A01 的 39 个 UI 工具清单当作 39 个可执行 AI 命令。A03 上下文提取、A04 全套命令适配、自然语言规划及多步执行均为后续任务。

`listExecutableTools(version)` 返回独立复制的可用元数据，包括输入/输出 JSON Schema 子集（closed object、required、additionalProperties:false、enum、pattern、number/integer、oneOf）、对象类型、作用域、副作用和本地成本；不暴露执行函数。仅支持精确版本 1，未知版本返回空列表/拒绝调用，避免静默使用不兼容语义。

`bindToolCall` 显式绑定目标图层以及文档 ID、会话 ID、文档修订；同 ID 重开仍不能使用旧调用。`prepareToolCall` 在实际执行前验证 envelope、参数、对象、权限、祖先/子树锁定和资源限制，生成带 expectedDocumentId/expectedDocumentSessionId/expectedRevision 的既有 reducer 动作，dispatch 时再次由 reducer 检查绑定。`executeToolCall` 是同步纯状态入口。拒绝返回原状态引用，不插入历史或修改作品。UI PropertiesPanel 的变换和逐项调整使用同一 prepare 入口，错误使用统一 message。

## 验证

注册表测试覆盖合法操作与撤销、未知命令/版本、额外 envelope/嵌套参数、NaN/Infinity/边界、负模糊、失效对象/文档/会话/修订、锁定祖先及子层、无编辑权限/资源上限、原型/继承字段/accessor/symbol、元数据复制、UI dispatch 过期二次拦截。现有属性组件、调整、历史测试验证接入。

无新像素算法，无网络和真实模型调用；验证只能证明本地命令和现有 reducer/UI 的契约，不是完整 AI 编辑产品验收。

独立审核补充：字符串 minLength 按原始长度执行；名称与 ID 的非空白要求通过公开 `pattern: "\\S"` 和同一校验器实现，避免向模型公开的 JSON Schema 与执行门禁不一致。新增空白名称拒绝、公开 pattern 和原始长度回归测试。
