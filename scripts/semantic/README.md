# 本地真实分割网关

这是实际 ONNX U2Netp 推理服务，不是固定样例或背景颜色阈值算法。仅支持显著主体/背景；不会声称支持按文本区分物体、多人或两件衣服。

安装和启动（Python 3.9+）：

```sh
python3 -m venv .venv-semantic
.venv-semantic/bin/pip install -r scripts/semantic/requirements.txt
.venv-semantic/bin/python scripts/semantic/gateway.py --install-model
.venv-semantic/bin/python scripts/semantic/gateway.py
```

在“语义目标与蒙版”点“使用本机 U2Netp”，地址为 `http://127.0.0.1:8766/segment`。网关只监听 127.0.0.1。浏览器发起的本地跨源调用允许 CORS，不向第三方上传照片。关闭网关用 Ctrl+C。不会开机启动或自动下载安装依赖。

模型沿用应用模型存储：macOS `~/Library/Application Support/com.draivio.app/models/u2netp/model.bin`；Linux `$XDG_DATA_HOME/com.draivio.app/models/u2netp/model.bin`；Windows `%APPDATA%/com.draivio.app/models/u2netp/model.bin`。应用模型管理的 U2Netp 现在下载相同 ONNX 文件；此前下载的 `.pth` 即使名为 model.bin，也会被网关 SHA256 校验拒绝，需重新安装。网关也可 `--model /absolute/model.onnx` 显式指定已验证文件。

权重来源：[rembg U2Netp release](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx)，4,574,861 字节，SHA256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`。下载上限 6MB，校验后原子落盘。模型结构及原始权重项目：[U-2-Net Apache-2.0](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE)，转换来源 rembg 的 MIT 许可：[rembg LICENSE](https://github.com/danielgatis/rembg/blob/main/LICENSE.txt)。运行时 ONNXRuntime 使用 MIT，NumPy BSD-3-Clause，Pillow HPND。模型不提交进 Git。

实现：图像 EXIF 方向归正，RGB resize320×320，归一化到最大值后使用 ImageNet mean/std，ONNX CPU d1 输出 min-max 归一化并插值回输入网格。U2Netp 没有校准对象置信度，因此网关固定报告 .5 并明确要求用户检查确认，这不是声称 50% 准确率。

实际验证：在隔离 `/tmp/draivio-semantic-venv` 安装 ONNXRuntime1.19.2、NumPy2.0.2、Pillow11.3.0，对本机 Pillow 测试资源 `hopper.png` (128×128 人像) 执行真实 CPU 推理，输出 alpha min0/max255 并包含中间值。该图像不是合成固定 mask。执行证据 `/tmp/semantic-real-inference.json`，HTTP 推理也由 test_gateway.py 实际运行。

```sh
SEMANTIC_TEST_IMAGE=/absolute/photo.png .venv-semantic/bin/python scripts/semantic/test_gateway.py
```

U2Netp 测试覆盖缺失模型、错误 PyTorch/损坏模型、指定物体明确不支持，以及真正 HTTP→ONNX→alpha 流程。未运行付费推理。指定物体使用下述单独部署的实例分割后端，不以 U2Netp 显著主体结果替代。

## 可选 GroundingDINO + MobileSAM 实例后端

`scripts/semantic/grounded.py` 是同一 `/segment` 契约的实际文本目标检测与像素分割适配器：GroundingDINO SwinT 输出目标框，MobileSAM ViT-T 以目标框为提示生成逐实例像素蒙版。目标框本身不会当成 mask；空检测或无效分割直接失败。候选全部返回由现有语义工作区明确点选；不会按面积或颜色猜选衣服。主体/背景仍使用真实 U2Netp，背景互补和羽化由客户端原图网格处理。

依赖是可选的，建议单独 Python3.11 venv，安装 `grounded-requirements.txt`。源码、权重、环境和配置置于仓库外；不自动下载或执行用户未知模型。配置以 `grounded-config.example.json` 为格式，所有二进制/词表必须通过 SHA256 校验。官方源仓库：

- [IDEA-Research/GroundingDINO](https://github.com/IDEA-Research/GroundingDINO)，本次调查 commit `856dde20aee659246248e20734ef9ba5214f5e44`，Apache-2.0。
- [ChaoningZhang/MobileSAM](https://github.com/ChaoningZhang/MobileSAM)，本次调查 commit `f706ad9c4eb7f219c00d9050e46328518ffb65d2`，Apache-2.0。仓库 weights/mobile_sam.pt SHA256见示例配置。
- [官方 GroundingDINO SwinT checkpoint](https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth)，约661MiB。本机已完成真实推理；记录见 `docs/evidence/semantic/grounded-local-inference.json`。权重仍是仓库外可选依赖，不随应用打包。
- [BERT uncased 原始词表](https://s3.amazonaws.com/models.huggingface.co/bert/bert-base-uncased-vocab.txt)，SHA256见配置；BERT Apache-2.0。适配器从检测检查点加载完整 BERT 参数，若任一模型参数缺失则拒绝启动，不以随机初始化代替语言模型；不调用 Hugging Face 在线自动下载。

```sh
/path/isolated-venv/bin/python scripts/semantic/gateway.py --grounded-config /outside/repo/grounded.json
```

语义工作区地址手动填写 `http://127.0.0.1:8766/segment`。本机快捷按钮文字仍说明 U2Netp；本适配器无需改动共享 UI。后端 GET 健康状态标明模型名称、objectSupported和targets。英文描述由模型词表处理；仅对“衣服/衬衫/外套/裤子/人”提供明确词汇翻译，其余输入不承诺中文开放词汇理解。检测分数不是校准准确率，低于客户端阈值须显式确认。CPU推理使用2线程，实例NMS阈值.5，检测阈值配置范围.1–.9，最多16候选/4MP；阈值无法制造不存在的对象证据。
