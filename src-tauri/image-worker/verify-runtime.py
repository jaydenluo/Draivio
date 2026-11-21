#!/usr/bin/env python3
"""Exercise the worker from a moved runtime directory with system paths only."""
import json
import os
from pathlib import Path
import platform
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib


def write_fixtures(root):
    extent = 2048
    png = root / "透明 大图.png"
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", extent, extent, 8, 6, 0, 0, 0)
    rows = (b"\0" + b"\x31\x56\x91\xfe" * extent) * extent
    png.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) +
                    chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))

    tiff = root / "灰度.tiff"
    tags = [(256, extent), (257, 2), (258, 8), (259, 1), (262, 1),
            (273, 0), (277, 1), (278, 2), (279, extent * 2)]
    tags[5] = (273, 8 + 2 + len(tags) * 12 + 4)
    tiff.write_bytes(b"II" + struct.pack("<HIH", 42, 8, len(tags)) +
                     b"".join(struct.pack("<HHII", tag, 4, 1, value) for tag, value in tags) +
                     b"\0" * 4 + b"\x40" * (extent * 2))
    jpeg = Path(__file__).resolve().parents[2] / "docs/evidence/portrait/originals/portrait-a.jpg"
    return [(png, "png"), (tiff, "tiff"), (jpeg, "jpeg")]


def main(root):
    windows = platform.system() == "Windows"
    architecture = platform.machine()
    name = "draivio-image-worker.exe" if windows else "draivio-image-worker"
    if not windows and (root / "macos-arm64").is_dir():
        for arch in ("arm64", "x86_64"):
            subprocess.run(["lipo", str(root / f"macos-{arch}" / name), "-verify_arch", arch], check=True)
        root = root / f"macos-{architecture}"
    env = {key: value for key, value in os.environ.items() if key.lower() in
           {"systemroot", "windir", "comspec", "tmp", "temp", "tmpdir", "home", "userprofile"}}
    env["PATH"] = str(Path(env.get("SystemRoot", env.get("SYSTEMROOT", "C:/Windows"))) / "System32") if windows else "/usr/bin:/bin"
    with tempfile.TemporaryDirectory(prefix="draivio-worker-smoke-") as temp:
        scratch = Path(temp)
        runtime = scratch / "Moved Image Runtime"
        shutil.copytree(root, runtime)
        worker = runtime / name

        def invoke(*args):
            result = subprocess.run([worker, *map(str, args)], cwd=scratch, env=env,
                                    capture_output=True, text=True, timeout=40)
            if result.returncode:
                raise RuntimeError(f"{args[0]} exited {result.returncode}: {result.stderr}")
            return json.loads(result.stdout) if result.stdout.strip() else None

        capabilities = invoke("capabilities")
        assert capabilities["protocolVersion"] == 1 and capabilities["decodersAvailable"], capabilities
        assert set(capabilities["formats"]) == {"jpeg", "png", "tiff"}, capabilities
        for source, kind in write_fixtures(scratch):
            metadata = invoke("probe", source, scratch / "icc-profile")
            assert metadata["format"] == kind and metadata["width"] > 0 and metadata["height"] > 0, metadata
            preview = scratch / f"预览-{kind}.png"
            dimensions = invoke("preview", source, preview, 256)
            assert 0 < dimensions["width"] <= 256 and 0 < dimensions["height"] <= 256, dimensions
            with preview.open("rb") as stream:
                assert stream.read(8) == b"\x89PNG\r\n\x1a\n", preview
            if kind == "png":
                cache = scratch / "工作像素.tiff"
                invoke("cache", source, cache)
                with cache.open("rb") as stream:
                    assert stream.read(4) in (b"II+\0", b"MM\0+"), cache
                assert cache.stat().st_size > 256, cache
        print(f"Verified relocated {platform.system()} {architecture} libvips {capabilities['runtimeVersion']}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve(strict=True))
