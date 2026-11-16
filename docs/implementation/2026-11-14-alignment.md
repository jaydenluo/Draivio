# F07 对齐与等距分布实施记录

任务 c60979b3-31a2-4ecb-97c8-ca2c982120a6；基准 171d5606201cc5c44f6292b35bcb5b7c27bc8fb2。保留开始时已有脏树，本项不提交、不推送、不调用外部服务。本记录仅描述本项增量，Git 整体 diff 包含其他任务工作，不能整体归属 F07。

## 行为与决定

- 多选时，顶部工具选项栏提供基准（画布、所选边界、关键对象）、关键对象选择、六方向对齐和两方向等距分布。使用原生 select/button 和中文 aria-label/title；24px 控件；沿用工具栏水平滚动，不新增右侧常驻区。
- `alignment.ts` 复用 `layerCoordinates.layerMatrix/invertMatrix/multiplyPoint`，换算为物理像素后组合父组世界矩阵。内容尺寸与画布尺寸不同时，按 `CanvasScene.layerTransformValue` 的 content scale 处理。用逆父组矩阵把世界位移转回 `layer.transform.rect` 的本地位移，保留尺寸、旋转和翻转。
- 普通图层以完整图层 frame 四角的世界 AABB 为边界；图层组使用可见子树 frame 的联合边界。此项不进行图像透明像素裁边或文字字形测量。
- 画布基准使用当前 `cropRect`，没有裁剪时为完整文档。所选边界为过滤并去重后的目标联合边界。
- 等距分布保持当前按轴排序，间距从外边界计算。画布模式固定可见画布两端；所选模式固定所选外端。关键对象模式沿用所选跨度计算等距位置，再整体平移，使关键对象保持原位；界面提示“关键对象固定；分布保持所选跨度”。关键模式不承诺维持两端的原绝对位置。
- 父子混选先归一化；隐藏、有效祖先锁、含锁定子树、奇异/循环层级目标不参与移动，并有排除说明。关键对象必须属于有效目标，不自动退回其他基准。少于三项禁分布，旁边文字和 title 解释；负间距整次拒绝，不写文档。
- reducer 专用 `align-layers` 操作在执行时重新计算和校验；所有移动一次历史提交；无变化/失败不新增撤销记录。保存仅使用原有 transform 字段，无 schema 扩展。

## 本项代码增量

新增 `src/document/alignment.ts`、`alignment.test.ts`；新增 `src/components/AlignmentControls.tsx`、`AlignmentControls.test.tsx`、`alignment.css`；`ToolOptionsBar.tsx` 新增组件导入及多选入口；`editor.tsx` 新增对齐模块导入、一个 action 类型及对应 reducer case；`documentHistory.ts` 仅新增该 action 的中文历史标签。

## 已执行验证

1. TDD：纯接口空实现时运行 `npm test -- --run src/document/alignment.test.ts`，24/24 行为测试失败，失败包括缺失计算结果、缺失去重及缺失历史提交。随后实现。UI 接入前运行 `npm test -- --run src/components/AlignmentControls.test.tsx`，2/2 因不存在对齐控件而失败。
2. `npm test -- --run src/components/AlignmentControls.test.tsx src/components/ToolOptionsBar.test.tsx src/document/alignment.test.ts`：退出码 0，3 文件 30 测试通过（补充边界测试前）。
3. `npm test -- --run src/document/alignment.test.ts src/components/AlignmentControls.test.tsx src/state/layerHierarchy.test.ts src/state/layerWorkspace.test.ts src/state/documentHistory.test.ts`：退出码 0，5 文件 61 测试通过；其中 F07 纯计算/reducer 30 测试、UI 2 测试。
4. `npm run build`：退出码 0，TypeScript 与 Vite 成功。构建仍提示主 JS chunk 大于 500kB（本项不做打包拆分）。

覆盖：三不同尺寸/旋转对象 × 三基准 × 六方向；关键对象不变；水平/垂直外边界等距；独立三角函数边界预期；cropRect；旋转缩放且内容尺寸不同的父组逆位移；父子归一化；锁定子树；负间距和失败不改图层/历史/版本；一次撤销/重做；encodeProject/decodeProject 保存重开；中文原生控件键盘 Enter。

## 待主代理汇总

真实浏览器固定 fixture、窄屏布局、全量测试、`vibeplan check` 及独立审核由主代理执行并补充真实证据。当前记录不宣称浏览器验收、独立审核或人审已经通过；本项交付等待审核。

## 独立审核修复与嵌套测量排查

独立需求审核发现：带子层且无 source 的组，若自身还有 shape/text/stroke，旧过滤条件会遗漏组自身 frame。补充三个回归，运行 alignment.test.ts 时均因只得到子层边界而失败；随后在组 frame 筛选中同时检查自身 shape/text/stroke，空容器仍不加入自身 frame。

修复后重新运行针对性五文件命令：退出码 0，64 测试通过（F07 几何/reducer 33、UI 2）；重新运行 `npm run build`：退出码 0，保持大 chunk 提示。

浏览器嵌套差异的原因已由主代理交叉验证：SVG 多层旋转时，外层 `g.getBoundingClientRect()` 会对子树局部 AABB 再包围，不能作为实际四角世界 AABB。读取实际 shape rect 的边界得到 x=165.0853838，与独立 manifest x=165.0853746 及对齐后的 peer 一致；此项无矩阵代码修改。浏览器证据详见主代理记录。

## 主代理真实浏览器验收

独立开发harness挂载真实AppShell/ToolOptionsBar/reducer，载入纯色公开fixture，使用正式中文控件操作。独立期望由Python物理像素矩阵生成，未调用产品alignment生成期望。

- 三个不同大小和0°/30°/-45°对象：三基准六方向共18项，与独立manifest比较，最大误差约0.00007px（浏览器屏幕几何浮点精度），全部低于0.001px。关键green固定。
- 三基准两轴分布共6项：相邻外边界gap差均低于0.001px，key模式green不动。原始实际数值见fixtures/alignment-verification/browser-geometry.json。
- 负间距：共享message明确“可用空间产生负间距”，文档指纹不变。
- 层级：父子混选只动根，锁定祖先下的child保持原位；不足三个有效根禁用分布；一次撤销回到原始指纹。嵌套shape与free-peer最终x均165.0853838。见browser-hierarchy-leaf.json。
- 测量口径修正：早期browser-hierarchy.json测外层SVG group.getBoundingClientRect，会将局部AABB再套祖先旋转导致二次包围过估；保留该历史数据但不作为几何验收。最终采用实际leaf shape rect屏幕边界和独立数学四角，确认产品矩阵正确。
- 900px宽浏览器：顶部工具区564px、对齐组约462px，无额外横向溢出挤压画布；截图browser-narrow.jpg。原生select/button可Tab操作，组件测试覆盖键盘触发；视口覆盖已恢复。

harness是仅开发入口，不被生产App导入。文件选择器与原生Tauri/Windows仍未在本轮实测，不用上述浏览器证据替代；保存往返由真实encode/decode和reducer测试覆盖。

## 最终集成检查

主代理最终`npm test -- --run --maxWorkers=4`100文件565测试通过exit0；`npm run build`、`vibeplan check`、`git diff --check`均通过exit0，保留既有chunk体积提示。两阶段独立复核通过，不自动批准人审；无提交推送。
