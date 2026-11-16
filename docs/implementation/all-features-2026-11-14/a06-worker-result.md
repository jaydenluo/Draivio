# A06 推理模型与视觉模型服务配置实施证据

任务 `578528f7-2294-4915-99fb-fd85d77d32a6`。本 worker 未修改云端状态，未发起付费服务请求。

## 已交付路径

- `src/ai/providers/modelCapabilities.ts`：显式 `image/text/vision` 模型能力；旧记录缺字段保持 image-only。助手候选按来源ID与模型ID区分，仅启用且具密钥、声明text的模型可选择；不依据模型名字或模型列表推断权限。独立 `assistantModel` 保存在来源记录，选择时清除其他来源偏好，不重排来源或模型数组。
- `src/creation/serviceConnections.ts`：扩展可选能力/助手字段，保存/解码校验未知能力键、类型、陈旧模型引用和无text助手配置。模型列表获取复用同一配置且保留原能力声明，不自动授予推理能力。
- `src/creation/modelSources.ts`：生图候选仅按声明image能力过滤，保留原始模型顺序，助手选择不修改图片Composer状态。
- `src/creation/ServiceSourceEditor.tsx`：实际来源编辑对话框新增逐模型能力声明勾选，解释视觉理解与图片生成差异；保存时清理已删除模型能力/失效助手偏好；编辑现有来源按原位置替换，避免原先remove/append造成来源重排。
- `src/creation/ServiceSourceSettings.tsx`：实际设置抽屉新增独立编辑助手选择框、账户区分、视觉能力标记、无可用模型配置引导；明确列表可访问不代表推理/工具调用可用。禁用来源立即移出助手候选。
- `src/styles/service-settings.css`：能力分组紧凑换行与助手设置区域样式。
- `src-tauri/src/service_connections.rs`：强类型boolean能力结构（拒绝未知字段）、可选serde默认兼容旧记录、原SQLite记录持久化助手与能力；保存前校验模型引用与text能力，不用无校验JSON Value替代类型。

## 实际验证

遵循先失败再实现：新能力模块测试先因缺少模块 exit 1；新UI测试先因无助手选择和引导而失败（11旧测试通过、2新测试失败）；原生roundtrip新测试先因serde丢弃新字段失败。实现后：

- `npm test -- --run src/ai/providers/modelCapabilities.test.ts src/creation/ServiceSourceSettings.test.tsx src/creation/serviceConnections.test.ts src/creation/ModelSourcePicker.test.tsx`：4 files / 33 tests通过，exit 0，日志 `/tmp/a06-final-tests.log`。
- `npm run build`：通过，exit 0，日志 `/tmp/a06-build-final.log`；保留现有大于500kB bundle warning。
- `cargo test --manifest-path src-tauri/Cargo.toml service_connections::tests`：6 tests通过，exit 0，日志 `/tmp/a06-rust-green.log`。包含SQLite存储、旧记录兼容、能力类型错误拒绝、原生成设置保留和多账户事务。
- `git diff --check -- src/creation/serviceConnections.ts src/creation/modelSources.ts src/creation/ServiceSourceEditor.tsx src/creation/ServiceSourceSettings.tsx src/creation/ServiceSourceSettings.test.tsx src-tauri/src/service_connections.rs src/styles/service-settings.css`：通过，exit 0。

全量测试由协调器串行执行；此处未声称已跑全量或原生GUI人工验收。

## 验收映射

1. `971f515e-00ff-4da9-b038-22b6a9caef90`：legacy配置单元验证助手候选为空、缺省image=true/text=false/vision=false；实际设置UI默认“未选择”，不将生图模型默认用于推理。
2. `3225aa5e-f7bc-4b50-af18-b4d9c47e431c`：不同账号同名模型均保留来源ID；UI保存声明并选择personal/shared后，来源顺序仍personal/work，图片模型仍image-z/shared/image-a，EditorState的composerSourceId和composerParameters.model保持原值；生图picker过滤text-only模型并保持其余原序；SQLite roundtrip完整保存字段。
3. `3876ebfc-d3aa-44a4-9ced-ca11a2514813`：无助手时真实抽屉展示配置引导并禁用select；停用当前助手来源后选择立即不可用；缺key来源不出现在候选；文案明确能力来自声明、列表测试不证明远端权限或工具调用。

## 范围边界

本任务交付配置、选择和持久化，不虚构已接入远端推理请求或工具调用；实际请求适配由A07承担。视觉为显式声明能力，不代表测试过任意供应商模型。凭据继续按既有本机/浏览器存储策略保存，不随文档导出；本项没有改变安全策略或扩大联网授权。当前无本项验收剩余问题。
