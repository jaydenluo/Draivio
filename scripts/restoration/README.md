# 本机 ESPCN 尺寸增强

本目录提供真实 CPU ESPCN 超分辨率推理，不使用最近邻或演示图片作为模型输出。2x/4x 模型来自 [TF-ESPCN](https://github.com/fannymonori/TF-ESPCN)，上游为 Apache-2.0；安装时核对 SHA256。模型下载到 `~/.cache/draivio/espcn`，不进入项目或 Git。

```sh
python3 -m venv .venv-restoration
.venv-restoration/bin/pip install -r scripts/restoration/requirements.txt
.venv-restoration/bin/python scripts/restoration/gateway.py --install-model
.venv-restoration/bin/python scripts/restoration/gateway.py
```

在超分工具中使用 `http://127.0.0.1:8767/restore`，选择 2x 或 4x。结果先进入 AI 结果，原图不变。新增图层支持撤销；源图与候选随项目保存。窗口取消、切换文档/目标、文档版本变化会放弃迟到结果。取消不声称能中断已经开始的 CPU 卷积，但迟到输出不会写入文档。

前端以重叠分块串行请求，使用预乘 alpha 权重融合，默认总工作内存预算 256 MiB。后端保留最近邻扩展的原图 alpha，仅推理 RGB。超出预算、像素非法或服务失败时不生成候选；无自动付费调用或重试。

ESPCN 只开放学习型尺寸增强，**不提供去模糊或生成式细节补全**。增加像素不等于恢复真实信息；小字、人脸和重复纹理必须对照原图检查。当前验证图像是自制合成小字、重复纹理、示意人脸和透明区域，不是实际人脸质量验收。

真实验证（需先启动 gateway）：

```sh
.venv-restoration/bin/python -m unittest discover -s scripts/restoration -p 'test_*.py' -v
npm test -- --run --config scripts/restoration/vitest.live.config.ts --maxWorkers=1
```

第二条真实调用共享 HTTP 封装和 TypeScript 分块实现，比对完整模型推理与分块输出。产物及成本 0 记录在 `docs/implementation/fixtures/restoration/`。离线契约测试不能替代这些真实推理记录。
