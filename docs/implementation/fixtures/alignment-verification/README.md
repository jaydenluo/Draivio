# F07 对齐与分布独立验收作品

这些 `.draivio` 是公开、纯色、无网络资源的 500×400 透明作品。生成器仅使用 Python 标准库和数学公式，不调用 `src/document/alignment`，manifest 是独立期望，**不是产品实际输出或浏览器验收证据**。

## 作品

| 文件 | 初始选择 | 用途 |
| --- | --- | --- |
| `three-layers.draivio` | red、green、blue；活动项 blue | 三个可见纯色层，角度 0°、30°、−45°；三种基准的六向对齐及正间距分布 |
| `negative-gaps.draivio` | red、green、blue | 同尺寸角度但集中位置，水平、垂直外边界间距均为负；核对明确反馈 |
| `hierarchy-locks.draivio` | rotated-parent、nested-child、locked-child、free-peer | 父组旋转 30°、缩放 55%×50%，子层另有 −15°；祖先锁、父子混选去重 |

颜色填满图层文档局部空间，所以纯色图层的几何边界等于变换后四角 AABB。组自身无色块，其边界按可见子树的 frame AABB 并集计算。本作品组内仅一个子层，所以 `rotated-parent` 与 `nested-child` 的世界 AABB 相同；`rotated-parent-frame` 额外保留父组自身变换矩形，明确区分二者。

## 独立计算方法

所有 manifest 值都是文档像素，而图层 transform.rect 是百分比。非正方形文档特意用于检测直接在百分比空间旋转而忽略宽高比的错误。

每层局部文档像素 `(u,v)` 经：

```text
T((x+w/2)*500/100, (y+h/2)*400/100)
× R(rotation)
× S(w/100, h/100)
× T(-250, -200)
```

旋转正角按 SVG 坐标顺时针。取 `(0,0)、(500,0)、(500,400)、(0,400)` 四角变换后的 min/max 得到 AABB。子层世界矩阵为 `parent × child`。生成器使用物理像素直接计算，不调用产品的 percentage matrix 实现。

六方向对齐：目标参考框对应左/中/右或上/中/下的位置，减去对象对应 AABB 锚点。manifest `alignmentDeltasPx` 提供完整 `dx,dy`，分别按 `selection`（三项并集）、`canvas`（0,0,500,400）和 `key`（green）的参考框计算。`key` 中 green 的所有 delta 都为零。操作只改平移，角度、宽高、图层对象数据不变。本作品 cropRect=null，画布参考等于整画布；产品存在裁剪框时以可见裁剪区域为参考。

外边界分布：按 AABB 起点排序，固定首尾，`gap = (last.end - first.start - Σextent)/(n-1)`；后一个的起点应等于前一个的终点加 gap。manifest 给出顺序、gap、每层 delta。它**不是中心点等距**。`distributionKey` 按所选 span 算相同 gap，再把全部结果平移为关键 green 不动，保持排序和外边界等距。负间距作品保留真实负值，不把它静默钳为零。

层级作品：移除已选父组的已选后代，再排除祖先有效锁，得到 `rotated-parent` 与 `free-peer` 两个可移动根。`nested-child` 局部 transform 不应改变；其世界移动由父组带动一次。`locked-child` 自身 locked=false，但 `locked-ancestor` locked=true，二者变换均不应改变。少于三个可移动根时，分布应禁用/解释。manifest 含 selection 六方向期望与另一个仅选 child/free-peer 的六向期望。子层世界平移需经过父线性逆矩阵换算为局部平移，例如世界 delta `(20,-10)` 对应局部约 `(22.400923, -37.320508)` 像素，精确值在 `childOnlyExample`。

## 真实应用验收顺序

最终 UI 标签：`对齐基准`（画布/所选边界/关键对象）、`关键对象`；`左对齐`、`水平居中`、`右对齐`、`顶对齐`、`垂直居中`、`底对齐`、`水平等距分布`、`垂直等距分布`。

1. 通过真实 AppShell 的打开项目按钮或主代理的开发加载入口打开 `three-layers.draivio`。确认三色、透明底、三个勾选项及旋转轮廓。
2. 每次从原始 fixture 重新加载或撤销回原始态，逐一验证参考为所选边界、画布、关键图层 green 的六方向按钮。把实际世界 AABB 与 `initialBoundsPx + dx,dy` 对照，关键对象不动。关键项需在 UI 显式设为 green；文件只保证三项选择，不预置产品尚未定义的 key 状态。
3. 水平/垂直分布分别从原始作品运行，按 manifest 检查外边界 gap；三个尺寸和旋转不同，能区别错误的中心分布。
4. 打开负间距作品，触发两向分布，记录可理解的负间距反馈与最终是否执行的产品策略；不得把静默失败当通过。
5. 打开层级作品，验证锁层不动、父子不双移。切为仅选 nested-child/free-peer 再对齐，检查父线性逆变换。组框采用可见子树 frame 并集。
6. 单次对齐/分布仅一次撤销恢复；重做恢复结果；保存再打开不变；键盘触发与中文说明可用。截图只能证明视觉，另保存实际层数据/AABB、操作与误差作为证据。

几何对比容差 `1e-7` 像素适用于导出的 JSON 双精度数据；UI 数值若仅显示两位小数，应采用其显示精度并另外读取原数据，不能据显示舍入判断矩阵失败。

## 生成和输入验证

```sh
python3 docs/implementation/fixtures/alignment-verification/generate_fixtures.py
npm test -- --run docs/implementation/fixtures/alignment-verification/fixture.test.ts
```

这只验证 fixture 可被真实 project schema 解码、manifest 内部关键约束成立，不代替实际按钮、撤销/保存和窄屏验收。
