#!/bin/sh
# Explicit developer build. Release packaging must supply a self-contained runtime.
set -eu
cd "$(dirname "$0")"
mkdir -p bin
cc -std=c11 -O2 -Wall -Wextra worker.c $(pkg-config --cflags --libs vips) -o bin/draivio-image-worker
