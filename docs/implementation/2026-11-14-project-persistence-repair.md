# F01 项目持久化退回修复（2026-11-14）

本轮在隔离工作树 `/Users/szys/.codex/worktrees/ai-editing-roadmap/Draivio` 执行，保留快照及其他工作包代码，无提交、推送、付费调用和远程任务状态修改。任务保持进行中，待主代理独立验收。

## 修复与证据

- 新增 `projectValidation.ts`，在 restore 之前检查 metadata、版本、像素预算、非空图层、ID/父子关系/循环、选中引用、文本/形状/笔画/蒙版/选区/变换/调整/AI结果结构。schema0、缺失metadata、零负尺寸、空layers、canvasTexts:null、selection:null 均拒绝；旧schema1迁移后也校验。
- 图像资源仅按schema处理 `layers[].source/thumbnail` 和 `aiResults[].source/thumbnail`；prompt、文字、AI来源说明里的URL和asset:逐字保留。内嵌资源去重，远程资源只通过共享 `requestImageData` 获取，15秒超时、32MB单资源上限、禁止重定向和凭据转发、校验图片MIME。临时blob明确报错，避免保存悬空资源。
- 序列化根字段白名单，history仅保留 `{id,label,tone}`，不递归存储快照；移除已知凭据键及运行时/撤销状态。
- editor窄集成增加documentId，new-document建立新身份并清空旧AI结果/历史/撤销/提示词；restore绑定项目metadata ID并恢复历史标签。ProjectFileControl在身份变化时清空保存目标，异步旧保存不能标记新作品已保存。
- 新建/打开/原生关闭统一保存、放弃、取消对话；保存失败、取消、保存期间又编辑都不能继续丢弃作品。浏览器关闭使用平台beforeunload提示（浏览器不能定制三按钮）。新建按钮打开尺寸设置。
- Rust原子写测试在同一既有目标路径完成临时写入后注入替换失败，验证目标仍为原内容；失败不是在无关路径模拟。

## 实际测试（退出码）

- 修复前 `npm test -- --run src/document/projectFormat.test.ts`：1；新增3例分别复现缺失校验、prompt被下载、blob悬空。
- 修复前控制器新增新建取消/失败保存测试：1；缺少三按钮对话。修复前documentLifecycle测试：1；缺少documentId。
- `npm test -- --run src/document src/lib/projectImageRequest.test.ts`：0；最终11文件45测试通过（含native关闭2例和scale1例），R02历史基线集成后重跑仍通过。
- `npm test -- --run src/document/projectScale.test.ts --disableConsoleIntercept`：0；1例通过。100图层/20张实际2048×2048渐变PNG，保存95ms，JSON 2,394,385 bytes，测试进程RSS基线191,578,112，保存/重开后237,502,464，进程峰值256,458,752 bytes。输入是可压缩渐变，进程峰值含生成fixture，不代表浏览器渲染峰值或所有真实照片负载。
- `CARGO_TARGET_DIR=/tmp/draivio-ai-editing-cargo-target cargo test --manifest-path src-tauri/Cargo.toml --offline project_files`：0；1原子替换测试通过。
- `npm run build`：在F01集成完成时0；最新一次在R02并行test-first阶段为1，仅因新documentHistory测试所需事务类型尚未实现。完整集成build由主代理等R02冻结后复跑。
- `vibeplan check`：0。
- `npm test -- --run` 在R02并行开发期间退出1：82文件，75通过/7失败；347测试，334通过/13失败（包含F01生命周期对历史空数组的旧断言与R02新基线冲突，已改为断言不含旧项目历史）；不作为通过证据，主代理稳定集成后复跑。

## 可复核样例

`docs/implementation/fixtures/editable-project-v2.draivio` 含图片、文本、笔画、形状、蒙版、分组、调整和AI结果/来源。图片为实际完整2×2 PNG，输入文件 `editable-source.png`。`projectFixture.test.ts` 通过独立zlib解码核对四个RGBA像素与行过滤字节，离线encode/decode保持指纹、去重为1资源，并通过真实reducer修改文本、移除笔画、变换拥有形状的图层、反转蒙版、修改调整/分组/AI收藏。

## 未完成与限制

- 尚无实际界面重开截图、桌面真实文件选择/重开键盘及窄面板证据；主代理/独立审核补充后再报告待验收。
- 当前形状对象没有独立属性修改reducer（既有能力），本轮验证保留可编辑结构与所属图层变换，不能声称已验证形状属性编辑UI。
- 尚需R02稳定后的整套测试/build；浏览器真实内存峰值、复杂照片压缩/保存负载尚未测量。
- 项目资源校验目前校验内嵌图片格式/base64结构，完整样例有独立像素解码证据；不声称所有恶意或损坏图片负载均已通过解码验证。
- 空项目名称保存会提示metadata.name结构错误并保留脏状态；尚未增加更友好的专门名称校验UI。

## 第二次独立复核修复

复核指出的三字节伪PNG与metadata凭据扩散均已新增失败测试并修复。同步结构解码会校验图像容器类型与完整边界（PNG分块、IEND，其他支持格式对应签名），拒绝 `data:image/png;base64,AQID`、截断及MIME不匹配。打开路径在任何restore/丢弃当前作品对话之前逐个使用真实浏览器 `Image` 解码，失败/超时/尺寸超预算均保留当前文档；保存路径先物化远程图片再通过同一实际浏览器解码门禁，之后才写目标。`metadata` 导入和导出均只投影id/name/updatedAt，不保留任意附加键或嵌套credentials。

新增控制器测试验证三字节伪PNG不会替换当前作品；另一个Image失败替身测试仅验证异步错误门禁，不被当作实际浏览器解码证据。完整PNG样例仍保留独立zlib像素验证。真实浏览器重开截图由主代理补充。

最新命令 `npm test -- --run src/document src/lib/projectImageRequest.test.ts` 退出0，11文件49测试通过；`npm run build` 退出0。本次仅修改projectFormat、ProjectFileControl及其测试和本报告，无editor/R02历史改动。
