#!/usr/bin/env python3
"""Build the x64 Windows worker against the relocatable upstream libvips DLLs."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile


VIPS_VERSION = "8.18.7"
VIPS_ARCHIVE = f"vips-dev-x64-web-{VIPS_VERSION}.zip"
VIPS_URL = f"https://github.com/libvips/build-win64-mxe/releases/download/v{VIPS_VERSION}/{VIPS_ARCHIVE}"
VIPS_SHA256 = "3a122eb3d588690008216f786338e2f9329dba3c3c2768b5933cf7299d549241"
PACKAGING_README_URL = f"https://raw.githubusercontent.com/libvips/build-win64-mxe/v{VIPS_VERSION}/README.md"
PACKAGING_README_SHA256 = "cb5421ac274ded1d0a6543f0427fa75b4a8b58d2f94db2cb4c9cf3ef0d8c9ed7"
WORKER = "draivio-image-worker.exe"


def download(url, output, digest):
    subprocess.run([
        "curl.exe", "--fail", "--location", "--silent", "--show-error",
        "--retry", "3", "--max-time", "300", "--output", str(output), url,
    ], check=True)
    if hashlib.sha256(output.read_bytes()).hexdigest() != digest:
        raise RuntimeError(f"SHA-256 verification failed for {url}")


def compile_worker(compiler, sdk, output):
    target = subprocess.check_output([str(compiler), "-dumpmachine"], text=True).strip()
    if target != "x86_64-w64-mingw32":
        raise RuntimeError(f"Expected an x64 MinGW compiler, got {target}")
    source = Path(__file__).with_name("worker.c").resolve()
    subprocess.run([
        str(compiler), "-std=c11", "-O2", "-municode", "-static-libgcc",
        "-I", str(sdk / "include"),
        "-I", str(sdk / "include" / "glib-2.0"),
        "-I", str(sdk / "lib" / "glib-2.0" / "include"),
        str(source),
        "-L", str(sdk / "bin"),
        "-l:libvips-42.dll", "-l:libgobject-2.0-0.dll", "-l:libglib-2.0-0.dll",
        "-o", str(output / WORKER),
    ], check=True)


def copy_runtime(compiler, sdk, output):
    # Follow imports from the worker recursively so the package includes the DLL
    # closure for this build, without the SDK's tools or optional codec plugins.
    objdump = compiler.with_name("objdump.exe")
    dlls = {path.name.casefold(): path for path in (sdk / "bin").glob("*.dll")}
    copied = set()
    pending = [output / WORKER]
    while pending:
        imports = subprocess.check_output([str(objdump), "-p", str(pending.pop())], text=True)
        for line in imports.splitlines():
            if "DLL Name:" not in line:
                continue
            name = line.split("DLL Name:", 1)[1].strip().casefold()
            if name in copied:
                continue
            source = dlls.get(name)
            if source:
                shutil.copy2(source, output / source.name)
                pending.append(source)
                copied.add(name)
    if "libvips-42.dll" not in copied:
        raise RuntimeError("The worker does not import the expected libvips DLL")


def check_worker(worker, directory):
    # An absolute executable and a system-only PATH prevent MinGW or an
    # installed libvips from taking the place of a missing bundled DLL.
    system_root = Path(os.environ["SystemRoot"])
    environment = {
        **os.environ, "PATH": os.pathsep.join(map(str, [system_root / "System32", system_root])),
    }
    result = subprocess.check_output(
        [str(worker), "capabilities"], cwd=directory, env=environment,
        text=True, timeout=30,
    )
    capabilities = json.loads(result)
    if (
        capabilities.get("runtimeVersion") != VIPS_VERSION
        or capabilities.get("formats") != ["jpeg", "png", "tiff"]
        or not capabilities.get("decodersAvailable")
    ):
        raise RuntimeError(f"Unexpected libvips capabilities: {capabilities}")


def bundle(output):
    if sys.platform != "win32":
        raise RuntimeError("This build script requires Windows")
    compiler = Path(os.environ.get("DRAIVIO_MINGW_GCC", r"C:\mingw64\bin\gcc.exe")).resolve()
    with TemporaryDirectory(prefix="draivio-windows-worker-", dir=output.parent) as temporary:
        root = Path(temporary)
        archive = root / VIPS_ARCHIVE
        download(VIPS_URL, archive, VIPS_SHA256)
        with ZipFile(archive) as sdk_zip:
            sdk_zip.extractall(root)
        sdk, = (path for path in root.glob("vips-dev-*") if path.is_dir())
        staged = root / "runtime"
        staged.mkdir()
        compile_worker(compiler, sdk, staged)
        copy_runtime(compiler, sdk, staged)
        notices = staged / "licenses"
        notices.mkdir()
        for name in ("LICENSE", "README.md", "versions.json"):
            shutil.copy2(sdk / name, notices / f"libvips-{name}")
        download(PACKAGING_README_URL, notices / "libvips-windows-dependencies.md", PACKAGING_README_SHA256)
        (notices / "upstream.txt").write_text(
            f"{VIPS_URL}\nSHA-256: {VIPS_SHA256}\n"
            f"https://github.com/libvips/build-win64-mxe/tree/v{VIPS_VERSION}\n",
            encoding="utf-8",
        )
        smoke_dir = root / "smoke"
        smoke_dir.mkdir()
        check_worker(staged / WORKER, smoke_dir)
        if output.exists():
            raise FileExistsError(f"Use an empty staging location: {output}")
        staged.rename(output)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python bundle-windows.py <output-directory>")
    output_dir = Path(sys.argv[1]).resolve()
    if output_dir.exists():
        raise SystemExit(f"Use a new output directory: {output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    bundle(output_dir)
