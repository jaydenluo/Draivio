#!/bin/sh
# Development-only build; intentionally fails when libvips development files are absent.
set -eu
exec cc -std=c11 -Wall -Wextra -O2 scripts/large-images/engine-spike.c $(pkg-config --cflags --libs vips) -o "${LI_ENGINE:-/tmp/draivio-engine-spike}"
