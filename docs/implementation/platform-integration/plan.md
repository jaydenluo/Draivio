# AI 平台与模型接入：父目标集成验收

授权来源：用户要求全部实现、主控负责验收，测试与独立审查通过后自动验收。Git基线 c30a9ba8e06832f75e321146f95c3a6b6bcd939f。

## 范围与状态
11个直属子项均云端done。父目标仅核对现有能力组合，无新增模型承诺、无付费调用、无提交或发布。

## 验收映射
1. 统一协议/注册/参数及上下文边界：src/ai/tools、context、execution，校验锁定、选区、稳定文档/版本绑定。
2. 模型供应商/官方自定义密钥/视觉输入/专属参数：src/creation/{modelSources,serviceConnections,generationOptions}、src/ai/providers；不把离线契约测试称为远端模型质量证据。
3. 排队/取消/重试/额度与凭据：src/ai/execution、src/lib/request、security；真实本地检查覆盖拒绝、取消、脱敏边界。

## 步骤
- 读取最新父任务与已验收子项；运行平台相关组合测试。
- 记录主控受控全量261files/1252tests通过及1native opt-in skip（不算通过）。
- 上传真实报告，调用AI模式专用task:review以独立只读审查全部必需准则；不以子项done自动批准父目标。

## 风险和边界
当前共享工作区并行实现Product/DoubleExposure/Batch，父任务不修改这些模块。新配方集成不在本父目标范围。测试和审查失败则保持未验收并同任务修复。

## 独立审查第1轮拒绝与修复清单
以云端repairFeedback为当前依据。之前139+14测试不足以证明父目标完整，不把这些结果当最终批准。

- 工具：核实并修复 drawingTools 对调用者selection的信任；仅用文档真实选区且完整几何约束。shape有限值校验；统一registry/planner/executor可执行工具声明。
- 服务：把requestChatCompletion接入实际Composer规划链路和参考图，明确离线/模型模式；官方未接真实服务时禁止演示完成，不虚构积分/额度。
- 凭据：存储层不写明文key。评估系统keychain/credential vault；浏览器仅会话内密钥，旧存储安全迁移，失败不泄漏。真实额度不足响应映射可理解提示。
- 逐领域委派独立修复实现，保持各自小范围；主控统一报告，AI模式再次task:review全准则复审。不得复用第1轮批准（第1轮未批准）。

并行配方实现不修改上述核心服务/工具边界，继续保留其工作区改动。

## 当前复验记录（2026-11-16）
工具域独立审查 /tmp/platform-tools-independent-review.json success；凭据域独立审查 /tmp/platform-credential-independent-review.json success；服务域新复审 /tmp/platform-service-readonly-review.json success。非2xx stalled stream曾绕过timeout，由独立probe捕获并修复，重新确认timeout/caller cancel会cancel reader，原失败不是通过。

主控受控全量 /tmp/draivio-resume-full-v1.log：280 files / 1326 tests passed，1 native opt-in skipped（不计通过），3个新海报真实生产渲染测试失败。此前海报8测试不充分，未批准；已拒绝进入第2轮修复，不能归因于无关测试后声称整体完成。

官方云仍没有真实服务后台连接，现明确提示未配置、绝不生成模拟结果或扣虚构积分。自定义模型真实兼容HTTP调用已接生产链路。官方云若是本父准则必需，必须保持该准则未完成，不借移除演示声称后台已经实现。
