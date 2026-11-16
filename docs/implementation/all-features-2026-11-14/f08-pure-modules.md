# F08 独立计算模块交接

2026-11-14。本阶段只有新增纯模块与测试，不是 F08 整体交付；未改 state、CanvasViewport、TransformOverlay、project 或 layers 共享文件，未 report success/accept。

## 新增路径和契约

- `src/document/guides.ts`：Guide/GuideSettings/GridSettings 可 JSON 序列化数据，defaultGuideSettings、严格 validateGuideSettings、不可变 updateGuideSettings。支持新增、移动、删除、锁定、设置；锁定线拒绝移动和删除，可继续作为吸附目标。这里只是数据操作，不是假装已接撤销或保存。
- `src/document/snapping.ts`：createSnapIndex 手势开始时建立排序轴索引，排除自己/隐藏参考对象；snapBounds 接收文档物理像素 AABB，返回修正 rect、命中线/anchor/距离和候选统计。zoomPercent 为编辑器25/100/400约定。move检查边与中心，resize仅检查主动边且固定对边；Alt或enabled=false立即返回原rect和空hits。最近距离优先；同距按guide/canvas/object/grid、稳定ID排序。previous用于同手势滞回，引用删除后不保留。rotatedBounds以物理像素计算旋转AABB。
- `src/document/rulers.ts`：rulerTicks按screen origin/zoom/可见长度生成1/2/5自适应主次刻度；visibleGridLines仅枚举可见范围，输出过密时按整倍数稀疏显示并返回实际显示间距。显示稀疏化不改变吸附的真实配置间距。
- 对应三个 `.test.ts` 文件。

## 实际先红与验证

1. 首次模块stub运行：3文件17测试失败，原因是所需功能未实现（不是导入失败）。测试几何随后修正为不越过固定resize对边的合法输入。
2. 第一版3文件17测试通过。
3. 添加密集对象fixture，实际失败：10000个近邻/重合参考位置，单查询检查60000候选，期望小于30。
4. 修复索引：等坐标保留固定优先级marker，二分仅找每anchor最近两侧；3文件18测试通过。

最终命令 `npm test -- --run src/document/snapping.test.ts src/document/guides.test.ts src/document/rulers.test.ts --silent=false`：退出0，3文件18项通过。

最终记录（含测试断言开销；本机单次数据，不是浏览器拖拽帧时）：

| 对象数 | 建索引 | 500次查询 | 检查候选总量 |
| --- | --- | --- | --- |
| 100 | 0.112 ms | 2.745 ms | 6000 |
| 10000 | 8.511 ms | 3.190 ms | 6000 |

当前普通查询每轴最多3个anchor、每anchor最多2个轴索引候选，即无grid/previous时最多12个候选；grid额外最多6个解析候选。密集fixture检查小于30。对象索引不随查询修改，不能在每帧重新build。

`npm run build`：退出0；仅现有大chunk及无效动态导入警告。`vibeplan check`：退出0。未执行本阶段全量测试；不把专项测试当作全应用验收。

## 后续串行接入的必要约束

1. 复用 F05 统一 world matrix/bounds；不能另复制只处理自身矩阵的工具。选中组移动需排除全部拖动子树的参考bounds。
2. rotatedBounds返回世界AABB；吸附修正必须通过正确逆矩阵映射到局部。不可直接把世界AABB resize结果写进旋转对象局部rect。move/resize使用不同主动anchor规则。
3. pointermove持续读取Alt及显式开关，Alt按下当帧清除命中；pointerup清空线；触屏有显式关闭入口。
4. 索引在pointerdown或目标几何/设置改变时建立，不在每次render/每帧建立。将rulers/guides放在编辑overlay，不进入CanvasScene导出。
5. 把GuideSettings接document schema/migration、snapshot、单次undo与项目保存重开；当前纯数据JSON往返不能代替这些验证。
6. 加真实100层拖拽pointer集成/浏览器帧时记录；验证25/100/400缩放、画布平移/旋转、固定对边、取消、锁定、设置面板、导出不包含辅助线。

无UI、真实拖拽帧时、撤销、项目保存接线证据，因此原任务必须保持in_progress。
