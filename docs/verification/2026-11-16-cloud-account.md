# Moviviz 云接入验收记录（2026-11-16）

实现位置：/Users/szys/AI/Draivio，分支 codex/editor-capabilities。没有提交、推送或部署。
用户文档：/Users/szys/AI/video-maker/cloud/docs/account-api-and-api-keys.md。
用户确认默认服务 https://www.moviviz.com，并要求可配置。

已实现：密码/验证码登录、注册、密码重置、退出；desktop 会话请求与合并令牌刷新；gateway余额（数字或小数字符串）、实际模型目录；HTTPS/本机HTTP可配置服务域名。服务变化清会话，生图在首个await前绑定session并在实际提交前校验，队列不得改用新账号凭证。云端生成前quotes获取费用并确认，拆分费用累计，补齐重新报价，余额不足停止；幂等键在401刷新重放时不变，网络不确定不自动重新付费。客户端不做本地扣减，成功/失败后刷新实际余额。

独立审查发现旧任务经过异步适配器导入后可能使用新会话的P1，已修复并增加动态导入和预览期间切会话两类回归。审查员复核关闭P1，独立运行两个相关文件19tests通过（当时快照）；最终主控检查见下。

## 最终检查

- `npx vitest run src/account src/creation/ImageGeneration.test.tsx src/creation/ImageGeneration.consent.test.ts src/creation/openaiImages.test.ts src/creation/imageRouting.test.ts src/creation/modelSources.test.ts src/ai/providers src/ai/execution/generationJobs.test.ts --maxWorkers=2`：15 files / 84 tests passed，退出0。
- `npm run build`：退出0。有体积与静态/动态导入混用警告，不是失败。
- 在src-tauri目录运行 `cargo test --lib cloud_account::tests -- --test-threads=1`：3 passed，退出0。覆盖可配置域名/路径方法、desktop头、错误脱敏、真实本地HTTP幂等头。有既有dead_code警告。
- `git diff --check`（本功能相关路径）：退出0。
- `vibeplan check`：退出0。
- 实际浏览器localhost:5173：打开云端账号，看到密码/验证码/注册/找回入口；展开云服务地址，值为https://www.moviviz.com，可保存地址。未提交认证表单。

## 剩余限制

没有测试真实账号登录、生产模型及实际扣费/退款；自动测试为本地HTTP和夹具，不能替代生产验收。会话仅内存，页面刷新需重新登录。浏览器直连需服务支持CORS，桌面原生桥不依赖浏览器跨域。充值在服务网站完成，未实现内嵌支付下单。文档注明未部署的API Key管理未接入。官方云缺少可验证蒙版契约，不开启蒙版编辑。此结果只覆盖本次云接入，不代表全部AI平台父目标和其他产品域已经验收完成。

## 相关文件

- `src/account/cloudAccount.ts`
- `src/account/cloudAccount.test.ts`
- `src/account/cloudModels.ts`
- `src/account/cloudBilling.ts`
- `src/account/cloudBilling.test.ts`
- `src/account/CloudAccountDialog.tsx`
- `src/account/CloudAccountDialog.test.tsx`
- `src/account/CloudServiceConfig.tsx`
- `src/account/CloudServiceConfig.test.tsx`
- `src/account/AccountIntegration.test.tsx`
- `src/account/cloudIntegration.test.ts`
- `src/account/cloudAccount.css`
- `src/account/useCloudAccount.ts`
- `src/components/TopBar.tsx`
- `src/components/BillingDialog.tsx`
- `src/creation/ImageGeneration.tsx`
- `src/creation/ImageGeneration.test.tsx`
- `src/creation/openaiImages.ts`
- `src/creation/modelSources.ts`
- `src/creation/AIComposer.tsx`
- `src/ai/execution/generationJobs.ts`
- `src/ai/tools/generativeTools.ts`
- `src/ai/providers/chatAdapter.ts`
- `src-tauri/src/cloud_account.rs`
- `src-tauri/src/lib.rs`
- `README.md`
- `docs/user-guide/cloud-account.md`
