#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 ]]; then
    echo "Usage: $0 <macos|windows> <archive-directory>" >&2
    exit 2
fi

destination=src-tauri/image-worker/bin
mkdir -p "$destination"

case "$1" in
    macos)
        for arch in arm64 x86_64; do
            target="macos-$arch"
            mkdir -p "$destination/$target"
            tar -xzf "$2/$target.tar.gz" -C "$destination/$target"
            lipo "$destination/$target/draivio-image-worker" -verify_arch "$arch"
        done
        ;;
    windows)
        tar -xzf "$2/windows-x64.tar.gz" -C "$destination"
        test -f "$destination/draivio-image-worker.exe"
        ;;
    *) echo "Unsupported platform: $1" >&2; exit 2 ;;
esac
