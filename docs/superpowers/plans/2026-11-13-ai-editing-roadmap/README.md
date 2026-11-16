# Draivio AI 编辑完整任务路线图

## 目标与边界

让用户通过自然语言完成精确编辑、局部生成和多步骤图片处理；结果可预览、微调、撤销、保存和导出。确定性操作走编辑算法，内容变化走图像模型；提示词负责理解和规划，不能替代底层工具。完成目标指下列明确列出的能力，不承诺覆盖Photoshop全部历史滤镜、插件、PSD双向兼容、3D或视频。

本轮是任务规划，不实施产品代码、不启动任务、不进行付费模型调用、不提交或推送Git。当前远程已有34项，已用task:list回读ID、状态、版本与完整计划；本轮复用，不重复创建或修改其验收。工作区存在并行改动，文件存在不作为完成证据。

## 技术现状与缺口

- 已有React/TypeScript编辑器、reducer、工具目录、像素合成/Worker、项目文件、Composer、来源配置、共享网络与message，以及OpenAI兼容生成和并发数量策略。
- 工具目录是UI工具定义，尚不能替代带参数schema和执行契约的AI工具注册表。
- ImageGeneration仍存在演示路径；图片协议配置不等于真实编辑适配器。需要以像素、真实请求及文档恢复证据逐项验收。
- 本轮未运行产品测试、构建或模型评测；以前的通过记录不视为当前基线。A01负责建立实施时基线。

## 全部工作分解

既有底层任务34项 + 新增任务37项 = 71项关联任务；R内4个修复工作包仍归原任务，不能额外计为4个新任务。

| 编号 | 新增任务 | 阶段 | 初估天 | 依赖 |
|---|---|---|---:|---|
| A01 | [编辑能力基线、缺口与 AI 工具覆盖矩阵](a01.md) | 1 | 3 | 无 |
| A02 | [AI 工具协议、参数校验与注册表](a02.md) | 1 | 4 | A01 |
| A03 | [文档上下文、作用范围与稳定对象绑定](a03.md) | 1 | 4 | A02, F04, R |
| A04 | [基础编辑工具的统一命令适配](a04.md) | 1 | 6 | A02, A03, R, F04, F07 |
| A05 | [AI 多步事务、预检、回滚与撤销](a05.md) | 1 | 6 | A04, R |
| A06 | [推理模型与视觉模型的服务配置](a06.md) | 1 | 4 | A02 |
| A07 | [推理请求适配、结构化输出与视觉输入](a07.md) | 1 | 6 | A06 |
| A08 | [自然语言规划器与能力约束](a08.md) | 1 | 7 | A03, A04, A07 |
| A09 | [计划执行器、依赖调度与运行状态](a09.md) | 1 | 6 | A05, A08 |
| A10 | [紧凑的一句话编辑入口与操作反馈](a10.md) | 1 | 4 | A09 |
| A11 | [临时预览、前后比较与参数微调](a11.md) | 1 | 5 | A05, A10 |
| A12 | [常用模糊与风格滤镜算法](a12.md) | 2 | 8 | A02, F03, F18 |
| A13 | [锐化、降噪与细节增强](a13.md) | 2 | 7 | A12 |
| A14 | [透视、镜头畸变与局部形变工具](a14.md) | 2 | 10 | A02, F04, F18 |
| A15 | [颜色调整、效果与局部蒙版的 AI 适配](a15.md) | 2 | 6 | A04, F11, F12, F13, F15, F16, F18 |
| A16 | [语义目标定位、分割与蒙版工具](a16.md) | 3 | 8 | A03, A07, F09, F10 |
| A17 | [生成编辑路由、能力协商与参数适配](a17.md) | 3 | 7 | A02, A06, F23, F24, F25 |
| A18 | [生成任务队列、额度提示与可靠取消](a18.md) | 3 | 6 | A09, A17 |
| A19 | [局部生成合成、保护区域与采用](a19.md) | 3 | 7 | A11, A16, A18, R, F24 |
| A20 | [AI 布光、背景匹配与合成协调](a20.md) | 3 | 8 | A15, A19, F15 |
| A21 | [放大、去模糊与修复模型接入](a21.md) | 3 | 7 | A17, A18, F03 |
| A22 | [识字、图片文字替换与可编辑排版](a22.md) | 3 | 9 | A07, A19, F14 |
| A23 | [可编辑操作配方引擎与版本管理](a23.md) | 4 | 6 | A09, A11, A15 |
| A24 | [电影调色与风格预设配方](a24.md) | 4 | 4 | A23, A12, A15 |
| A25 | [人像自然精修配方](a25.md) | 4 | 8 | A23, A13, A16, A19 |
| A26 | [产品抠图、背景与自然投影配方](a26.md) | 4 | 7 | A23, A16, A19, A20, F15 |
| A27 | [双重曝光与创意合成配方](a27.md) | 4 | 5 | A23, A16, F06 |
| A28 | [海报排版、多尺寸与文字保护配方](a28.md) | 4 | 9 | A23, A22, F07, F14, F27 |
| A29 | [连续对话修改、操作记录与纠错](a29.md) | 5 | 6 | A09, A11 |
| A30 | [AI 编辑记录持久化与离线恢复](a30.md) | 5 | 5 | A23, A29, F01, F02 |
| A31 | [AI 配方批处理、预算与逐项结果](a31.md) | 5 | 7 | A18, A23, A30, F28 |
| A32 | [AI 编辑评测集与质量回归体系](a32.md) | 6 | 7 | A10, A11 |
| A33 | [AI 工作流性能、内存与大图处理](a33.md) | 6 | 8 | A12, A19, A21, A30 |
| A34 | [AI 工具调用边界、凭据与数据保护](a34.md) | 1 | 5 | A02, A03, A07 |
| A35 | [跨平台、无障碍与完整工作流验收](a35.md) | 6 | 8 | A24, A25, A26, A27, A28, A31, A32, A33, A34, A37, F03 |
| A37 | [画笔、填充、修复、文字与路径的 AI 工具适配](a37.md) | 2 | 9 | A02, A03, A05, F14, F19, F21, F22 |
| A36 | [用户说明、能力声明与分阶段发布验收](a36.md) | 6 | 4 | A35 |

## 阶段及验收门槛

1. 一句话编辑：A01–A11与A34。先完成基础几何/图层的两到三步编辑、计划校验、真实执行、预览微调和一次撤销。依赖R/F04/F07等相应已有能力；新增滤镜、专业色彩能力不阻塞首版。A32先提供60条首版评测；A35/A36先提交首版子集证据，完整任务保持未完成直至其全部标准通过。
2. 精确滤镜：A12–A15与A37，衔接已有曲线、HSL、图层效果、调整层、智能滤镜。滤镜必须真实产生像素变化，保持选区外内容，预览/导出一致。
3. 局部与生成：A16–A22，复用已有主体、蒙版、参考图编辑、填充与扩图；补齐能力路由、成本/取消、保护合成、布光、超分和文字替换。
4. 常用技巧：A23–A28，交付可编辑配方框架与电影调色、人像、产品、双重曝光、海报五类配方。
5. 连续使用：A29–A31，交付多轮纠错、项目恢复和受预算限制的批处理。
6. 发布质量：A32–A36贯穿执行，最后完成完整目标的语料/图像评测、性能、数据保护、跨平台与说明审核。首版可以先交付，完整目标不能以首版证据提前关闭。

专业扩展F29–F33（RAW、高位深、ICC、CMYK、软打样）已存在backlog，可后续实施，不是本路线普通8bit sRGB AI编辑的发布阻塞项。多尺寸海报等单项可依赖F27，不要求首版提前完成全部底层任务。

## 既有任务：复用与完成程度

下列任务已在Vibe Plan，不新建、不覆盖状态；完整实现与验收定义已有远程计划及本地文件。每项原有验收标准也保存到manifest.existingReferences，便于后续执行核对。

| 编号 | 任务 | 当前状态 | 远程ID |
|---|---|---|---|
| F01 | [建立可恢复编辑状态的 Draivio 项目文件](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f01.md) | in_progress | 8e0e4c40-174e-4351-b7ff-9f41dc44f297 |
| F02 | [自动保存、恢复记录与崩溃恢复](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f02.md) | backlog | 6ed0827b-7695-4b62-a4c9-a32e9da456f0 |
| F03 | [PNG、JPEG、WebP 与选区/图层导出](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f03.md) | backlog | 86334889-4f25-4c1d-8f34-afdb937b29fd |
| F04 | [画布尺寸、图像缩放与统一像素坐标](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f04.md) | in_progress | 206ef3a1-378e-4dcd-8e49-1c95096aa733 |
| F05 | [组整体变换与图层合并](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f05.md) | backlog | fcb42afd-75ad-4118-9793-e0ed297b7935 |
| F06 | [剪贴蒙版与完整常用混合模式](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f06.md) | backlog | fa00ba86-4507-4ae0-91c9-1bc405e94ede |
| F07 | [对齐与等距分布](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f07.md) | backlog | c60979b3-31a2-4ecb-97c8-ca2c982120a6 |
| F08 | [标尺、参考线、网格与智能吸附](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f08.md) | backlog | 3dcae1cb-edf1-4148-96a9-1b883b5b520a |
| F09 | [真实主体识别与背景移除](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f09.md) | backlog | 868741ae-597d-48af-a575-1201884a4e4b |
| F10 | [选择并遮住与蒙版边缘精修](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f10.md) | backlog | e8e211d0-5b0e-4ec0-81d0-5d517fb8dab5 |
| F11 | [直方图、曝光与准确白平衡](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f11.md) | backlog | c94960da-5e9a-45dc-b6d6-37a9d0c4281a |
| F12 | [曲线与色阶](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f12.md) | backlog | 5bf6994e-5c2d-46ab-a1b8-b439c6188ba2 |
| F13 | [HSL、色彩平衡与调整预设](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f13.md) | backlog | 46c5e27c-1f9c-4614-a45f-df13d499e74d |
| F14 | [文本框、段落排版与局部文字样式](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f14.md) | backlog | 79956f5e-d48e-4ef3-90d9-575117f1a6d5 |
| F15 | [可重编辑的图层效果](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f15.md) | backlog | 2f295f3e-dd37-4a5e-931e-f8a26b1ab663 |
| F16 | [调整图层与局部调整蒙版](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f16.md) | backlog | d868e8c5-6ae1-4fda-90b8-f9e4cbc354af |
| F17 | [智能对象与替换内容](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f17.md) | backlog | 4a41be31-fad3-4251-9d3b-a323437c1739 |
| F18 | [智能滤镜与可重排处理链](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f18.md) | backlog | 5d6da8e9-4f92-447e-b8b4-ec0c9d8e2ecd |
| F19 | [污点修复、仿制与修补工具完整闭环](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f19.md) | backlog | 35cf98fb-639a-49fd-873b-e5e26f0a1f7b |
| F20 | [移除工具与内容识别填充](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f20.md) | backlog | c594f3eb-b5f9-4ce0-9944-eb5b53faf4e6 |
| F21 | [减淡、加深与局部色调画笔](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f21.md) | backlog | 06c7705f-79d1-42da-8caa-0359f99fc1a2 |
| F22 | [路径锚点编辑与形状布尔运算](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f22.md) | backlog | 6bf0d14d-36db-491b-b99c-bbc19402af71 |
| F23 | [真实参考图编辑与按模型显示参数](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f23.md) | backlog | 1b230fe9-afb5-4be5-be5c-889397983034 |
| F24 | [选区生成填充与 AI 物体移除](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f24.md) | backlog | 9bc057e9-6e10-4581-a2a5-44fd6e78ef4a |
| F25 | [扩图与画布外生成](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f25.md) | backlog | f3a699a2-6102-4617-8200-fb086bbd4008 |
| F26 | [多文档标签与状态隔离](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f26.md) | backlog | 7e930f74-07f8-41ae-aee5-50b6303446fb |
| F27 | [多画板与同设计多尺寸版本](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f27.md) | backlog | 9d2d2685-1fcb-46c3-b64b-948695a20176 |
| F28 | [批量缩放、导出、水印与调整预设](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f28.md) | backlog | 379fb04f-26a5-4cae-9de3-f2d4aa8f2f0d |
| F29 | [RAW 解码与基础显影](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f29.md) | backlog | cb50a00b-2792-40b1-8398-1a9c3533b8bd |
| F30 | [16 位与 32 位浮点高精度处理](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f30.md) | backlog | 3e2fb3da-b5ff-4961-8610-0fab97a8cb34 |
| F31 | [ICC 色彩管理与配置文件转换](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f31.md) | backlog | e91f3f81-16dd-423c-b482-0218e5a5d7b7 |
| F32 | [CMYK 文档与印刷导出](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f32.md) | backlog | 27fab054-0c10-4bd6-bb31-16ad514b8a88 |
| F33 | [软打样、色域警告与印刷检查](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/f33.md) | backlog | f37f0db2-51ec-4f83-92ef-fe41a45914c2 |
| R | [升级图片处理右侧工作区与 AI 结果工作流](/Users/szys/AI/Draivio/docs/superpowers/plans/2026-11-13-editor-capabilities/existing-workspace-amendment.md) | in_review | 92116dc7-a664-47f2-918e-8afa9d501a98 |

R内现有工作包：R01组继承、深复制与锁定；R02统一历史与撤销；R03候选、比较与采用；R04八项基础调整真实生效。各A任务以R UUID关联必要前提，实施时核对相关工作包证据，不把旧任务in_review当作已验收。

## 需求覆盖核对

| 用户能力 | 覆盖任务 |
|---|---|
| 自然语言、多步规划、上下文与整图/图层/选区 | A02–A10 |
| 可靠执行、预检、事务、撤销、取消、预览、微调 | A05、A09–A11、A18、R |
| 多供应商/多账号、推理与生图分工、转站参数/多图 | A06、A07、A17、A18、F23 |
| 模糊、锐化、降噪、风格、畸变、曝光、曲线、HSL | A12–A15、F11–F18 |
| 画笔、填充、修复、文字形状和路径的AI调用 | A37 |
| 主体、背景、衣服等语义目标和局部保护 | A16、A19、F09、F10、F16 |
| 移除、填充、换背景、扩图、参考图 | A17–A19、F19、F20、F23–F25 |
| 布光、产品投影、超分修复、精确改字 | A20–A22、F14、F15 |
| 电影调色、人像精修、产品、双重曝光、海报 | A23–A28 |
| 连续对话、可复用技巧、批处理与预算 | A23、A29、A31、F28 |
| 项目恢复、导出一致性、凭据与云处理边界 | A30、A34、F01–F03 |
| 正确率、视觉质量、性能、跨平台、发布 | A01、A32–A36 |

## 创建字段与预算说明

所有新增任务统一feature/backlog/P2，无截止日期、不预设负责人。每项估算为初始工作量天数，允许后续按实际评估调整；不能累加推断承诺交期，不计入actualHours。阶段表给出执行顺序，创建后dependsOnKeys转换为确切UUID。

## 完整写入内容与确认点

[manifest.json](manifest.json)含每项title/type/status/priority/estimate/dueDate/description/acceptanceCriteria、步骤、文件、验证方法与依赖。A01–A37各文件是要上传到云端的完整任务计划；描述中也内嵌步骤和验收，不依赖云端访问本地链接才能理解。

待用户一次确认后：逐项task:create，成功即记录ID；用task:update关联依赖；用task:plan上传完整Markdown；回读核验37项内容及依赖，运行vibeplan check，并汇总实际写入数量。遇网络结果不明先查询，避免重复；遇权限/版本冲突停止对应变更并保留进度。原34项任务只引用，不改动。不会因创建自动启动、提交实施报告或标记完成。

当前状态：用户已确认创建与实施。37项任务已创建，37份详细计划已上传，依赖已关联；A01已启动，原工作区任务R经独立复核退回修复。

## 规划校验结果

规划阶段已检查37项payload与详细计划齐全、34项已有任务ID可关联、依赖无缺失且无环；本地校验、`vibeplan check`与`git diff --check`均退出0。随后用户已授权子代理实施及主代理独立验收，实际创建与上传结果见write-status.json。

## 实施检查点

首批子代理交付39个工具的源码/测试能力基线及独立R01–R04缺口审查。全量基线283通过、1失败，构建通过；取色定向重跑4/4通过，原失败根因尚未确认。R原版本12经主代理退回，先修复R01，R02–R04仍待交付；单个工作包通过不代表整个R完成。

已prepare冻结快照`.vibe/ai-editing-roadmap-batch-2026-11-13.json`，包含70个未验收任务。F01处于另一执行流程的in_review中，没有重复启动。快照尚未运行外部批处理器；当前由本对话子代理实施。

A01的源码能力矩阵已交付，真实浏览器逐工具像素/历史/保存/导出证据仍待补齐；不得将该子交付误报为整个A01或整条路线通过。主代理另行浏览器检查观察到画笔落笔，后续热更新令页面短暂空白，撤销SVG对照未成立，需待源代码稳定后重跑。
