# F10 / F19 独立审查：均不批准

审查者 `/root/review_existing_deliveries`。当前主目录只读核查，独立专项7文件42 tests通过（exit 0），未修改源码/云端，未跑全量。测试通过未覆盖下述实际缺口。

## F10 e8e211d0-5b0e-4ec0-81d0-5d517fb8dab5

- `83dffe6f-edbe-4b08-94c0-10faddc9dea4` failed：refineAsync.ts alphaToSelection把alpha>0二值化，丢半透明边缘/密度；去彩边无预览。
- `e383ad45-834b-4250-854f-cc3424ba3cd5` failed：Escape只关面板不取消job；提交selection-to-mask使用当时selectedLayerId，目标未冻结且revision不含选择，切换目标可误写。
- `e0b872fd-ca95-424f-b0e0-4b096e306026` failed：MaskOverlay morphology→Gaussian顺序与纯算法box smooth→shift→box feather不一致；结果已二值化又携带refinement被二次处理。TopBar选中层参数处理整个导出合成RGBA，选中改变输出、污染其他层，背景不透明时可能无效果。
- `f110fe70-aa14-4496-92fe-dd593a8787bf` failed：低清preview直到全清结束才返回且UI不显示；仅Promise.resolve微任务后同步全清，不可交互取消；selectionToAlpha亦同步全尺寸。

平滑/密度/去彩边panel局部state不反馈画布低清预览；属性面板缺常用密度/羽化。

## F19 35cf98fb-639a-49fd-873b-e5e26f0a1f7b

- `497a539b-7f34-4d27-b0a6-7e7108259d6f` failed：只有5x5样例，缺纹理/皮肤/边缘固定验证；clone未消费硬度/透明度/对齐，没有对齐开关；patch拖动偏移未参与计算。
- `5f38b093-246f-4b4b-91af-6d607b253f98` failed：below排除当前层；clone/patch/服务heal不使用所选scope；SVG筛选删祖先g会删允许子层；clone仍rasterize-layer改原层。
- `312db790-2849-44d3-9fb5-0246de8f8000` failed：确认旧pendingRepair不复查version；处理中无Abort，cancel仅清已完成结果；add-repair-layer无祖先锁定守卫，等待确认时锁定仍可加入。
- `02d3be34-0c27-402e-8cd1-b45bef9b998e` failed：localPoint处理仍保留transform的文档SVG像素，变换层错位；patch混用local源点与document selection；缺高缩放/旋转/非默认画布真实采样和断网验证。

缺repair保存/重开/导出像素对照。repair source为整张采样图而非局部差异，置顶可能遮盖上方内容或重复合成半透明对象。

同任务修复后补真实UI/固定像素回归，重新报告和独立审查，旧成功报告不得用于批准。
