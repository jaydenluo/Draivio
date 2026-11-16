# A26 产品抠图、背景与自然投影配方

用户已授权重分析依赖并实施全部任务，测试/独立审查后由主控验收。本worker不提交、不自验收。Git base c30a9ba8e06832f75e321146f95c3a6b6bcd939f；共享未提交改动均保留。

## 依赖重分析与已确认设计
保留A23配方引擎、A19蒙版编辑、A20布光、F15效果依赖。仅移除2553bc91-6db9-43e0-8378-552c50d3dbea整体任务依赖：该任务剩余阻塞是文本指定多实例，产品本次3项验收仅需用户接受的商品alpha，不需要文本实例定位。代码证据：SemanticSelectionWorkspace实际capture原图→requestSegmentation→mapTargetMask→commit-mask；scripts/semantic/gateway.py真实U2Netp主体/背景已交付；editor.layerMasks接收已确认软alpha与手工精修。产品配方不猜mask，不调用未完成文本实例能力，无mask明确阻塞并引导“语义目标与蒙版”或手动蒙版。无自动模型请求。

推荐独立ProductRecipeWorkspace/product.ts，复用现有选择/蒙版、CanvasScene和整体apply-edit-plan事务，不修改RecipeWorkspace/runner。替代方案把新工具注入通用runner会侵入其他并行配方；把商品栅格化则丢原像素和文字保护，均不采用。纯色/已存在图层背景在本地完成；生成背景显式跳到现有生成入口，用户确认费用后生成并将已下载图层选作背景，配方本身不请求模型。

## 结构与执行
1. 产品输入必须真实普通图片、可见且未锁定（含祖先），已有有效启用蒙版。先支持顶层商品，嵌套组明确提示先移到顶层，避免克隆父层导致几何变化。蒙版原样复制到新的商品副本，原source与像素不改，原商品层隐藏保留。
2. 参数：纯色/现有背景；商品位置dx/dy；接触投影offsetX/Y、宽度/压扁、模糊、透明度。投影独立图层；投影中心由接受蒙版的底部界限映射世界坐标得出，允许接触位置调整。背景/阴影/商品处于同一画板。
3. UI预览在私有draft渲染，参数变化取消旧候选；采用绑定documentId和contentRevision/selection fingerprint并再次查锁，单次apply-edit-plan提交、一次undo；切文档/取消/异常不改作品。采纳后商品蒙版可继续用现有蒙版画笔/边缘细化精修，透明/反光不佳不静默重绘。
4. 记录可解释的产品配方参数/来源，使用现有可持久化图层元数据及正常图层/蒙版对象，不存请求密钥。独立阴影正常层变换/不透明度可继续调整，背景可替换。

## 文件与测试
新增src/ai/recipes/product.ts、ProductRecipeWorkspace.tsx、product.test.ts、ProductRecipeWorkspace.test.tsx、product.pixels.test.tsx；root最终只接AIComposer import+mount。必要前后图/像素证据放docs/implementation/product-recipe，用户说明docs/user-guide/product-recipe.md。
先失败测试：原图source/几何/文字不变，软alpha/镂空保留；阴影位置/模糊/透明度独立；无mask/锁定/过期失败；预览/取消/切文档无变更；采用整体undo；项目往返和真实CanvasScene→导出像素一致。样例带瓶身条纹文字、镂空与半透明玻璃alpha，前后真实PNG，不作真实分割准确率证明。执行focused、build、vibeplan check，主控独立审查，不跑全量/不收费调用。

## 验收映射与边界
728b333d-c763-4990-ad9a-13bd211c301a：原图像素资源与变换复制、固定文字/几何像素断言及前后图。
6e336a6a-901c-4f34-a582-16f0c9f55bff：独立投影层、接触坐标参数、后续层编辑和项目持久化。
95a5be80-d613-43c1-b294-689627dabe46：软alpha精修入口明确、保留原图与蒙版、绝不自动重绘或生成；已有背景可无网编辑。
风险：显著主体mask对玻璃可能不佳，用户需显式精修；自然投影是可调接触椭圆近似，不声称物理光照推理。图像算法不接入付费服务。默认商品零位移保持几何；用户位移显式改变位置。

## 已实施检查点
- 云依赖更新v9→详细计划v10→readyv11→startv12→testing65/v13。未变动其他四项依赖、未自行验收。
- 已新增product.ts与ProductRecipeWorkspace；原像素商品副本、原样软mask、独立SVG接触投影/纯色或已有背景，参数使用受校验Layer.productRecipe元数据持久化。editor类型及projectFormat/projectValidation仅小补丁验证元数据；RecipeWorkspace/runner未修改。
- 经主控明确授权，AIComposer已仅追加import+mount；真实入口测试通过。图像与位移候选同步私有draft，documentId/contentRevision/目标复核后单事务采用。
- 已实测瓶身字样像素逐点相等、镂空alpha0、玻璃alpha128；真实CanvasScene和serializeExport像素一致，项目重开/undo/redo一致；before.png/after.png/export.png为固定测试输出。
- 明确拒绝缺失/禁用/反相蒙版、锁定/隐藏/嵌套/特殊/独立绘制对象；透明/反光精修按钮选择现有mask工具，不调用生成模型。背景生成入口仅切composerMode并说明后续显式确认，无网络调用。
- 新增实际仿射位移失败回归，确认位移在文档物理像素而不是原仿射缩放后的坐标；现仿射平移项加documentDelta，线性几何不改。
- 首次build因并行doubleExposure红阶段模块未就绪失败，已保留/tmp/draivio-product-build.log（后续fresh会覆盖，历史结果在最终报告说明）；待其就绪后复验，不改其他worker文件。
- 最终fresh专项 npm test -- --run --maxWorkers=2 --testTimeout=30000 src/ai/recipes/product.test.ts src/ai/recipes/product.pixels.test.tsx src/ai/recipes/ProductRecipeWorkspace.test.tsx src/creation/ComposerLayout.test.tsx src/creation/AIComposer.conversation.test.tsx，exit0，5files/15tests；npm run build exit0；vibeplan check exit0。保留既有非阻塞bundle体积/动态导入warning。
- 最终实现已冻结，准备真实success报告，进入in_review后由主控安排独立只读审查；不提交、不自行验收。用户说明docs/user-guide/product-recipe.md。受支持范围是顶层普通图片及接受mask；对物理精确光照、文本实例分割均未作声明。
