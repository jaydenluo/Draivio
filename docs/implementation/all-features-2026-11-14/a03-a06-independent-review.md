# A03 / A06 独立只读审查

审查者：`/root/review_existing_deliveries`，与实施 worker 分离。目标 checkout：`/Users/szys/AI/Draivio`。未修改源码或云端。

独立实际执行：8 个专项测试文件 / 53 tests passed（exit 0）；`cargo test --manifest-path src-tauri/Cargo.toml service_connections::tests`：6 tests passed（exit 0）。未运行全量、构建或真实付费 API，未声称原生 GUI 实测。

## A06 可验收

任务 `578528f7-2294-4915-99fb-fd85d77d32a6`。

- `971f515e-00ff-4da9-b038-22b6a9caef90` passed：modelCapabilities.ts 缺省 image-only，助手仅来自显式 text 声明，默认不选择；旧配置和真实设置 UI 测试通过。
- `3225aa5e-f7bc-4b50-af18-b4d9c47e431c` passed：sourceId+model 选择不重排；ServiceSourceEditor 原位更新账号；modelSources image 过滤保序。多账号、同名模型、Composer 不变及 SQLite 往返测试通过。
- `3876ebfc-d3aa-44a4-9ced-ca11a2514813` passed：独立助手选择、无候选配置引导、明确列表可访问不等于推理/工具权限；排除禁用和缺密钥来源。

原生 service_connections.rs 强类型布尔能力、可选字段兼容旧记录，保存拒绝陈旧模型引用和无 text 助手，SQLite 独立重跑通过。验收范围为配置、选择、迁移及能力声明，不代表后续推理/视觉请求或工具调用已验证。

## A03 暂不整体验收

任务 `beeba626-ccf0-4071-bb39-af5d4b042ab9`。三项列明验收均有通过证据：有效祖先锁定/空目标/空选区校验；延迟请求期间切换选择和文档仍绑定原目标；累计真实 CanvasScene 祖先变换并独立对照多个点与 AABB。

但完整描述和共同要求仍有缺口：preview 只有尺寸 metadata，未提供实际降采样预览；revision 仅为 provenance 内容指纹，结果提交无版本冲突守卫。报告已披露，不能把三条 criterion 通过解释为上述能力完成。先补齐这些范围内能力并重审，再批准整个任务。
