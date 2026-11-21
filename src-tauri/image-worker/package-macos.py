#!/usr/bin/env python3
"""Build and relocate one native macOS image-worker runtime."""

import argparse
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import tempfile
from typing import Optional

VIPS_VERSION = "8.18.7"
VIPS_HASH = "5baaead3b0bb20ffdb9e9ff09aa9fda08620923df77b63b436654cb5e0b3bf94"
VIPS_URL = f"https://github.com/libvips/libvips/releases/download/v{VIPS_VERSION}/vips-{VIPS_VERSION}.tar.xz"
SYSTEM_PREFIXES = ("/usr/lib/", "/System/Library/")


def run(*args, **options):
    subprocess.run(args, check=True, **options)


def output(*args, **options):
    return subprocess.check_output(args, text=True, **options).strip()


def load_commands(file):
    commands = output("otool", "-l", str(file))
    deps = re.findall(
        r"cmd LC_(?:LOAD_DYLIB|LOAD_WEAK_DYLIB|REEXPORT_DYLIB|LOAD_UPWARD_DYLIB|LAZY_LOAD_DYLIB)\n"
        r"\s+cmdsize \d+\n\s+name (.+) \(offset \d+\)",
        commands,
    )
    rpaths = re.findall(r"cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+) \(offset \d+\)", commands)
    versions = re.findall(r"\bminos ([\d.]+)|cmd LC_VERSION_MIN_MACOSX\n\s+cmdsize \d+\n\s+version ([\d.]+)", commands)
    minimum = max((version_tuple(left or right) for left, right in versions), default=())
    return deps, rpaths, minimum


def version_tuple(value):
    return tuple(map(int, value.split(".")))


def expand_reference(reference, file, executable):
    if reference.startswith("@loader_path/"):
        return file.parent / reference.removeprefix("@loader_path/")
    if reference.startswith("@executable_path/"):
        return executable.parent / reference.removeprefix("@executable_path/")
    return Path(reference)


def resolve_library(reference, file, executable, rpaths):
    if reference.startswith("@rpath/"):
        relative = reference.removeprefix("@rpath/")
        for directory in rpaths:
            candidate = directory / relative
            if candidate.is_file():
                return candidate.resolve()
        raise RuntimeError(f"Cannot resolve {reference} from {file}")
    candidate = expand_reference(reference, file, executable)
    if candidate.is_absolute() and candidate.is_file():
        return candidate.resolve()
    raise RuntimeError(f"Cannot resolve {reference} from {file}")


def build_worker(root, source_archive: Optional[Path]):
    archive = root / f"vips-{VIPS_VERSION}.tar.xz"
    if source_archive is None:
        run("curl", "--fail", "--location", "--silent", "--show-error", "--retry", "3",
            "--max-time", "300", VIPS_URL, "-o", str(archive))
    else:
        shutil.copyfile(source_archive, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != VIPS_HASH:
        raise RuntimeError("libvips archive checksum mismatch")
    run("tar", "-xf", str(archive), "-C", str(root))
    source = root / f"vips-{VIPS_VERSION}"
    install = root / "install"
    build = root / "build"
    env = {**os.environ, "CC": "clang", "CXX": "clang++"}
    # Keep package discovery anchored to the running machine's Homebrew architecture.
    brew = Path(output("brew", "--prefix"))
    prefixes = [brew / "opt" / formula / "lib/pkgconfig" for formula in
                ("glib", "expat", "libpng", "jpeg-turbo", "libtiff", "little-cms2", "libexif", "zlib")]
    env["PKG_CONFIG_PATH"] = os.pathsep.join(map(str, [*prefixes, brew / "lib/pkgconfig"]))
    env.pop("PKG_CONFIG_LIBDIR", None)
    run("meson", "setup", str(build), str(source), "--prefix", str(install), "--libdir", "lib",
        "--buildtype", "release", "--wrap-mode", "nofallback", "-Dauto_features=disabled",
        "-Djpeg=enabled", "-Dpng=enabled", "-Dtiff=enabled", "-Dlcms=enabled", "-Dexif=enabled",
        "-Dzlib=enabled", "-Dmodules=disabled", "-Dcplusplus=false", "-Dexamples=false",
        "-Dnsgif=false", "-Dppm=false", "-Danalyze=false", "-Dradiance=false", env=env)
    run("meson", "install", "-C", str(build), env=env)
    env["PKG_CONFIG_PATH"] = str(install / "lib/pkgconfig") + os.pathsep + env["PKG_CONFIG_PATH"]
    flags = shlex.split(output("pkg-config", "--cflags", "--libs", "vips", env=env))
    worker = root / "draivio-image-worker"
    run("clang", "-std=c11", "-O2", "-Wl,-headerpad_max_install_names", "-Wl,-rpath," + str(install / "lib"),
        str(Path(__file__).with_name("worker.c")), *flags, "-o", str(worker), env=env)
    return worker, source, install


def collect_libraries(worker, brew_cellar, install):
    files = {worker: Path(worker.name)}
    destinations = set(files.values())
    rewrites = {}
    queue = deque([(worker, [])])
    minimum = ()
    while queue:
        original, inherited_rpaths = queue.popleft()
        deps, declared_rpaths, min_version = load_commands(original)
        minimum = max(minimum, min_version)
        rpaths = [expand_reference(item, original, worker) for item in declared_rpaths] + inherited_rpaths
        changes = []
        for reference in deps:
            if reference.startswith(SYSTEM_PREFIXES):
                continue
            library = resolve_library(reference, original, worker, rpaths)
            if not (library.is_relative_to(brew_cellar) or library.is_relative_to(install)):
                raise RuntimeError(f"Unexpected dependency outside the build and Homebrew: {library}")
            if library not in files:
                destination = Path("lib") / library.name
                if destination in destinations:
                    raise RuntimeError(f"Conflicting library basename: {library.name}")
                destinations.add(destination)
                files[library] = destination
                queue.append((library, rpaths))
            bundled = files[library].as_posix() if original == worker else files[library].name
            changes.extend(("-change", reference, f"@loader_path/{bundled}"))
        rewrites[original] = (changes, declared_rpaths)
    return files, rewrites, minimum


def write_notices(stage, sources, brew_cellar, vips_source):
    roots = sorted({brew_cellar.joinpath(*path.relative_to(brew_cellar).parts[:2])
                    for path in sources if path.is_relative_to(brew_cellar)})
    entries = [(root.parent.name, root.name, root) for root in roots]
    entries.append(("libvips", VIPS_VERSION, vips_source))
    versions = {}
    for name, version, source in entries:
        versions[name] = version
        target = stage / "licenses" / name
        target.mkdir(parents=True, exist_ok=True)
        candidates = [*source.iterdir(), *(source / "share/doc").glob(f"{name}/*")]
        notices = [path for path in candidates if path.is_file() and
                   re.match(r"^(licen[cs]e|copying|copyright|notice|lgpl|gpl|sbom\.spdx\.json)", path.name, re.I)]
        if not any(path.name != "sbom.spdx.json" for path in notices):
            raise RuntimeError(f"Missing installed license notices for {name} {version}")
        for path in notices:
            shutil.copyfile(path, target / path.name)
        for formula in (source / ".brew").glob("*.rb"):
            shutil.copyfile(formula, target / formula.name)
    return versions


def package(stage, worker, vips_source, install):
    architecture = platform.machine()
    if architecture not in ("arm64", "x86_64"):
        raise RuntimeError(f"Unsupported macOS architecture: {architecture}")
    cellar = Path(output("brew", "--cellar")).resolve()
    files, rewrites, minimum = collect_libraries(worker, cellar, install)
    for original, relative in files.items():
        run("lipo", str(original), "-verify_arch", architecture)
        bundled = stage / relative
        bundled.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, bundled)
        bundled.chmod(0o755)
        changes, rpaths = rewrites[original]
        args = [*changes]
        for rpath in rpaths:
            args.extend(("-delete_rpath", rpath))
        if original != worker:
            args.extend(("-id", f"@loader_path/{bundled.name}"))
        if args:
            run("install_name_tool", *args, str(bundled))
        run("codesign", "--force", "--sign", "-", str(bundled))
    for relative in files.values():
        bundled = stage / relative
        deps, new_rpaths, _ = load_commands(bundled)
        if new_rpaths or any(
            not dep.startswith(SYSTEM_PREFIXES) and
            (not dep.startswith("@loader_path/") or not expand_reference(dep, bundled, stage / worker.name).is_file())
            for dep in deps
        ):
            raise RuntimeError(f"Unbundled dependency in {relative}")
        run("codesign", "--verify", "--strict", str(bundled))
    versions = write_notices(stage, files, cellar, vips_source)
    manifest = {
        "architecture": architecture,
        "minimumMacOS": ".".join(map(str, minimum)),
        "libvipsSource": {"url": VIPS_URL, "sha256": VIPS_HASH},
        "dependencies": versions,
    }
    destination = stage / "draivio-image-worker"
    env = {"PATH": "/usr/bin:/bin", "HOME": str(stage), "LANG": "C"}
    capabilities = json.loads(output(str(destination), "capabilities", cwd=stage, env=env))
    if set(capabilities["formats"]) != {"jpeg", "png", "tiff"} or not capabilities["decodersAvailable"]:
        raise RuntimeError("Bundled runtime does not provide the required decoders")
    manifest["capabilities"] = capabilities
    (stage / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source-archive", type=Path, help="Use a verified local copy of the pinned archive")
    args = parser.parse_args()
    if platform.system() != "Darwin":
        raise RuntimeError("Run on a native macOS builder")
    destination = args.output.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError(f"Output must be empty: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="draivio-vips-build-") as temporary, \
         tempfile.TemporaryDirectory(prefix=".draivio-vips-stage-", dir=destination.parent) as temporary_stage:
        worker, vips_source, install = build_worker(Path(temporary).resolve(), args.source_archive)
        staged = Path(temporary_stage) / "runtime"
        staged.mkdir()
        package(staged, worker, vips_source, install)
        staged.replace(destination)
    print(f"Staged macOS {platform.machine()} worker in {destination}")


if __name__ == "__main__":
    main()
