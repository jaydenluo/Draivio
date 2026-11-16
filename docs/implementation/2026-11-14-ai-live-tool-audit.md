# AI 工具实时审计：原生输入阻塞检查点

2026-11-14，A01 任务 `3fe3accf-0bfd-40bb-873d-01e9c02f6626`。独立工作区 `/Users/szys/.codex/worktrees/ai-editing-roadmap/Draivio`，早期开发地址 **http://127.0.0.1:5178/**；后续静态审计地址 **http://127.0.0.1:5189/**，实际标题 **Draivio — AI 图片创作**。

这不是 A01 完成报告。**已计入完整工具验证：0/39；39 项全部仍需逐工具执行。** 截图、AX 文本及诊断点击不能证明 RGBA 一致性、撤销、保存重开或导出正确。

最新状态：静态阶段手势尝试3/39，完整验证0/39；原生输入报错阻断。下方保留早期暂停记录，后续恢复细节见“静态快照恢复与原生输入阻塞”。

## 早期实际发生的操作

1. 此代理 `cua.createBrowserTab('iab', …)` 返回 `Browser is not available: iab`，浏览器提供者列表为空。
2. 经父代理指示，用 `cua.getApp('Google Chrome')` + Cmd+N 建立专用新窗口；未改动原有窗口/标签。
3. 原提供的5174地址实际打开另一应用登录页，未登录或执行任何该应用操作。父代理核查开发日志后改为5178。
4. 5178成功显示 Draivio 默认500×625海报、81%视图、图层/历史/Composer。进行了画笔选择及坐标校准诊断；过程中作品区完全变黑，AX 编辑器子树消失。
5. 一次重新加载恢复默认海报。重新选择画笔并点击 AX“画布交互层”，截图可见中心珊瑚色圆点。这只是诊断输入的可见结果；未对其完成历史、撤销、保存或导出检查，故不计入完整工具验证。
6. 父代理明确要求暂停：R01/F01 正在修改源码，避免 HMR 干扰证据。专用窗口保留5178，不再反复刷新。

## 未完成项目

- 所有39工具的稳定逐项实际手势、前后可见结果与阻塞反馈。
- 每个作品操作的历史/撤销/重做观察。
- 项目保存、离线重开与对象保持。
- SVG/其他可用格式下载及独立解码比对。
- 调整、AI结果等额外路径的实际端到端检查。

精确剩余工具 ID：

`select`, `move`, `selection`, `rectangle-select`, `ellipse-select`, `lasso-select`, `polygon-select`, `bezier-select`, `magic-wand`, `subject-select`, `brush`, `pencil`, `gradient-brush`, `brush-line`, `soft-brush`, `smudge`, `eraser`, `background-eraser`, `healing`, `clone-stamp`, `mask`, `mask-quick`, `mask-gradient`, `mask-subject`, `crop`, `perspective-crop`, `transform`, `text`, `shape`, `shape-ellipse`, `shape-line`, `shape-arrow`, `pen`, `picker`, `fill`, `gradient-fill`, `pan`, `zoom`, `rotate`

## 证据边界与下一步

原始证据是本次 CUA 调用中的 AX 树和截图；没有宣称已保存截图文件或已计算像素差。黑屏与活跃源码更新同时发生，父代理确认 HMR 在变化；没有独立诊断其唯一根因。原先的2026-11-13源码/测试基线继续保留，不能把更新中的R01实现追溯视为旧结果。

等待父代理明确通知代码冻结后恢复，从干净fixture重新逐项执行；不调用真实付费服务，不使用密钥或私人图片。此次只增加本报告/JSON及基线检查点引用，不修改源码、测试或远端任务。

## 静态快照恢复与原生输入阻塞

父代理随后授权在 **http://127.0.0.1:5189/** 的冻结构建继续。该构建来自原工作区 `dist`，复制至 `/tmp/draivio-ai-audit-static-20261114`，是**最终修复之前的有日期基线**，不能作为当前源码或最终验收结果。此前5178暂停时间线保留；本节为后续状态。

**工具手势尝试3/39；完整验证仍为0/39。** 另有直线画笔仅完成选择，实际手势被输入通道错误阻断。

| 工具 | 实际操作与观察 | 结果边界 |
|---|---|---|
| brush | 选择后在默认海报拖动，截图见珊瑚色线条 | 仅局部可见效果，未完成撤销、保存、导出或像素验证 |
| pencil | 选择后拖动，截图见第二条珊瑚色线条 | 同上 |
| gradient-brush | AX确认“渐变画笔”和“末色”；两次尝试 `[1400,1050]`→`[1650,1100]` | 截图仍显示此前铅笔工具栏和两条旧线，AX与截图表现不一致；新笔迹/渐变效果不确定 |
| brush-line | 新鲜菜单选中后，AX确认“直线画笔”“拖动绘制直线” | 拖动返回 `Computer Use server error -10005: noWindowsAvailable`，不计手势执行 |

撤销观察也不确定：一次旧AX索引操作切换了Composer模式；后续坐标撤销与Cmd+Z未建立明确移除/恢复证据。不能据此断言产品撤销缺陷，也不能声明通过。

随后库存仍列出Chrome正在运行且浏览器提供者为空。重新 `getApp('Google Chrome')` 可读取5189编辑器AX，但再次拖动和点击均返回同一 `noWindowsAvailable` 错误。已结束原生UI阶段；其余36工具尚无实际手势，所有39工具仍欠完整验证。保存重开、导出下载、RGBA一致性均未执行。

快照SHA-256（来源 `/tmp/draivio-ai-audit-static-manifest.json`）：

| 文件 | SHA-256 |
|---|---|
| index.html | dc8494107bcdd24f2001f9eff482fdbc26b8a93edc116debee807fb7b59e0870 |
| assets/index-B1FLZj3t.css | 526b0a10c66eb39e0d5f225aa1307a20a4ef0a39d4abb5f3f85749642e1cb9f0 |
| assets/index-Db4xoRbE.js | b6ad0fee554532c16f384afc8420d56b4cddc5d2b2589e5bb6d4cb713adb3b7e |

下一步需要恢复原生输入或可用浏览器提供者，在明确标识的冻结快照上继续逐项验证。此阶段只更新四个审计Markdown/JSON；未修改产品源码/测试、远端任务或提交。没有执行真实模型API、登录、使用密钥或私人资产。
