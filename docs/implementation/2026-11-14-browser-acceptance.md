# 浏览器验收记录（阶段证据，未完成整体验收）

工作树：/Users/szys/.codex/worktrees/ai-editing-roadmap/Draivio。浏览器：Codex IAB。

## 静态构建5190（R02首次冻结后）

- 选择画笔，在画布[440,290]→[495,330]拖动，看到珊瑚色笔画及“画笔笔画”历史；点击撤销，笔画消失，历史回到初始。截图在本会话CUA工具记录，未声称已保存磁盘截图。观察到画布/Composer上移约133px，未诊断，不能作为布局稳定通过。
- 打开导出弹窗时错误提示“画布已导出为SVG”，交R03修复；实际PNG下载成功到 /Users/szys/Downloads/draivio-canvas.png，sips验证500×625。
- 鼠标click等待filechooser两次超时；输入的Enter键成功触发文件选择器。选择本地 editable-project-v2.draivio，经未保存确认后放弃本次测试改动，成功打开，图/组/形状/文字显示；错误显示未保存，已复现交R02修复。

## 修复构建5194（/tmp/draivio-acceptance-20261114-0110）

- 同样通过项目文件输入Enter选择fixture，确认放弃初始示例文档，真实浏览器Image解码门禁通过并显示完整可编辑离线样例。
- 顶部显示“已保存”，历史只有“打开项目”基线，图层组和图片可见，prompt恢复asset:literal prompt，fixture模型未配置因此禁止执行AI。
- 截图在本会话CUA工具记录；尚未保存独立截图文件，也未完成编辑后保存下载再重开、桌面Tauri picker/close及各工具39项全链路。

## 仍需验证

调整SVG实际像素/透明边缘/变换缩放及大图性能；AI候选浏览器操作；39工具逐项真实行为及撤销/保存/导出；恢复状态/导出范围等后续任务。上述阶段结果不能支持整个71任务或R/F01完整通过。


## 主代理真实调整像素导出

通过5194 UI打开64px色卡项目、逐项输入并blur、实际PNG下载：neutral/八项35/blur100/clarity70共11组。原始图与测量保留fixtures/adjustment-browser-20261114。默认导出白底，CPU透明参考的alpha/RGB不能直接当容差，待composite reference修正。仅不透明区域：neutral完全一致，brightness/contrast/saturation/temperature/shadows/highlights最大1色阶；blur35最大2，blur100最大3；sharpness35最大35均差8.46，clarity70最大57均差16.23，实测FAIL。另通过UI导出clarity70.svg留诊断。交原实现者定位真实SVG而非弱化容差。

AI候选采用UI：重开样例已有1候选，点击新增图层出现生成结果·3正式层，撤销后该层消失、采用状态恢复；这只证明已有候选采用路径，不证明真实服务或新批次全部条件。

## 分离卷积修复后真实导出

5196 为当前源构建：清晰度70重新输入并导出 `/Users/szys/Downloads/draivio-canvas (12).png`，运行 `adjustment-raster-tools.py compare ... clarity70 --white-background`：64×64、alpha 最大差0，RGB最大差3，平均差0.4027。旧25×25单滤镜实际输出与identity完全相同（独立诊断low25 16384字节差异为0），separable25实际产生变化；因此采用两轴卷积实现并重新通过真实导出。该证据覆盖64px色卡，未覆盖大图WebKit/Tauri性能。
