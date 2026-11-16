# RAW 本地显影

桌面顶部「RAW 显影」打开 `.cr2/.nef/.arw` 等原始文件；选择已有 RAW 图层可重开参数。曝光、相机白平衡的 RGB 倍率和高光重建生成临时预览，确认一次写入一个可撤销事务。取消、失败和过期文档不会写入。显影后的图层同时保存原始字节、SHA256、方向与参数、16 位 sRGB 资源；项目离线恢复不需要再次下载原始文件。

当前验证的模型/格式是 Canon EOS 40D sRAW2 CR2、Nikon D2H NEF、Sony ILCE-7S APS-C ARW，详见 samples.json 与 real-sample-evidence.json。其他相机与格式由 LibRaw 实际检测，未实测不保证支持；没有内嵌 JPEG fallback。原始文件最多16MiB，传感器最多6000万像素，显影固定半尺寸并保留16位sRGB像素，输出最多32MiB。RAW图层使用现有高精度/ICC导出管线；预览PNG是8位显示副本。

## 安装与许可

可选、仅本机的 Python3.11+ 环境：

```
python3.11 -m venv ~/.local/share/draivio-raw
~/.local/share/draivio-raw/bin/pip install rawpy==0.28.0 Pillow
DRAIVIO_RAW_PYTHON=~/.local/share/draivio-raw/bin/python npm run tauri dev
```

不配置环境变量时查找 `python3`。缺依赖明确报错，不把机器安装状态当通用解码支持。无需上传图像；后端是独立子进程，UI可取消，90秒超时，1.5GiB RSS上限（250ms检查），Linux另设2GiB地址空间限制。原始字节和JSON IPC按资源预算限制。峰值RSS的macOS实际值（字节）记录在证据JSON。

rawpy0.28.0 MIT包装器，实测动态LibRaw0.22.2；LibRaw提供LGPL2.1/CDDL1.0双许可，选择LGPL2.1路径。rawpy官方二进制不包括GPL2/GPL3 demosaic packs。许可证原文在licenses/；本项目不打包或静态链接codec二进制，用户安装的独立运行环境保持可替换。未来分发二进制需随附对应版本源码/重新链接等LGPL义务。

样本来自raw.pixls.us逐样本CC0声明，逐文件SHA256验证，外部cache路径写在samples.json中，不把巨文件入Git。运行 `DRAIVIO_RAW_PYTHON=... cargo test --manifest-path src-tauri/Cargo.toml --lib raw_decode` 验证native控制边界；`.../bin/python scripts/raw/verify_samples.py` 验证三格式逐参数像素、方向和原始字节，方向6变体明确标记为修改TIFF tag的契约样例。
