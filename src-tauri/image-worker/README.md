# Native image service v1

Build the helper explicitly with `npm run image-worker:build` (requires C11,
libvips 8 development headers and pkg-config). `npm run image-worker:test`
uses the frozen real LI01 corpus in `/tmp/draivio-large-images`.
`cargo test --manifest-path src-tauri/image-worker/host-tests/Cargo.toml`
runs the exact production Rust service modules without the GUI dependency.
The main Tauri cargo test also runs these tests and requires that same helper
and fixture corpus; missing prerequisites are failures, not silent skips.

Debug desktop runs may set **absolute** `DRAIVIO_IMAGE_WORKER` to this built
helper. Only `cfg(debug_assertions)` reads this variable. Release resolves
`resource_dir/image-worker/draivio-image-worker[.exe]`; tauri.conf bundles
`image-worker/bin/` into that resource folder. Build the helper before Tauri
packaging; there is no PATH search and no automatic browser fallback.
The local build links Homebrew libraries. It is **not** a self-contained
redistributable runtime. A release pipeline must supply a minimal relocated,
signed libvips runtime and licenses (LI19); clean-machine macOS, Windows,
Linux and WebView resource display remain unverified. This configuration
provides the resource mapping, not proof that distribution requirements pass.

## Service contract

The native picker alone creates path capabilities. Frontend commands receive
an opaque asset ID, per-import session and lease, raw dimensions, sample
precision, orientation and profile identity. No file path or original pixel
array is returned. Each import has its own private directory; source SHA-256
becomes available only after the independent `original` streaming-copy job
finishes. Preview does not wait for copy/hash or tiled BigTIFF preparation.
Source signature includes file size, mtime, and Unix inode/device/ctime with
nanoseconds. Concurrent changes invalidate the revision and stale outputs.
Windows metadata-based detection is weaker and needs a platform file-handle
identity implementation before claiming equivalent source-change protection.
The current session continues to validate its external source even after copy;
LI05 must bind durable original references to the immutable copied resource,
not treat the temporary URL or external pathname as persistent identity.

Host limits: 16 imports, 4 active operations including probes, one cache and
one streaming-original task at a time, maximum 16 published resources/asset,
64 GiB total published bytes, 16 GiB input, 8 GiB/cache output, 32 MiB/preview
or protocol read, 8 concurrent protocol reads, 1 billion pixels, 1 page,
1 MiB ICC, 4 MiB blob metadata, preview edge <=4096, deadline <=120 seconds.
Worker validates all numerical parameters independently. Worker file size
and CPU rlimits supplement host cancellation and deadlines. These are **not**
a process RSS hard limit or scratch-space reservation. Scratch peak quota and
disk-space preflight remain incomplete; writes fail with structured storage
errors and private staging directories are cleaned. Per-job scratch TMPDIR,
TMP, TEMP and libvips disk threshold are set by host and cleaned after kill/wait.

Working cache preserves raw coordinate orientation, source channel precision
and profile. v1 editing accepts only u8 RGB/gray/alpha; u16, float and CMYK
are explicit unsupported_precision results. Preview applies EXIF and its
single embedded-profile-to-sRGB conversion inside thumbnail; its resource is
marked display-only with its actual encoded width/height, display coordinate
space, and a transform identity and must not flow into edits.
The returned PNG is encoded binary, not a working-pixel descriptor. LOD/region
APIs are subsequent tasks and are not exposed here.

The async custom protocol resolves only registered opaque resource IDs after
live session/revision checks. Host supplies the platform URL via Tauri
convert_file_src; JS never constructs URLs. Full preview/ICC requests and
bounded explicit single byte ranges are supported. Cache/original large reads
must request chunks. Responses include MIME, exact length, nosniff, no-store,
restricted CORS, and range headers. Existing app CSP is null and remains a
known security-hardening/platform verification gap, not a passing CSP test.

## Manual desktop verification (not run by this change)

From the repository root:

```sh
npm run image-worker:build
DRAIVIO_IMAGE_WORKER="$PWD/src-tauri/image-worker/bin/draivio-image-worker" npm run tauri:dev
```

The service has no product import UI until LI04/LI05 integration. In the local
WebView devtools, invoke the typed client (Vite's development module URL):

```js
const {ImageAssetClient} = await import('/src/assets/imageAssetClient.ts');
const images = new ImageAssetClient();
const source = await images.pick(); // actual native JPEG/PNG/TIFF picker
const previewJob = await images.start(source, 'preview', {maxEdge: 1024});
const preview = await images.wait(source, previewJob.jobId);
const picture = new Image();
picture.src = preview.resource.resourceUrl; // host-supplied platform mapping
await picture.decode();
console.log(picture.naturalWidth, picture.naturalHeight, preview.resource);
const response = await fetch(preview.resource.resourceUrl);
console.log(response.status, response.headers.get('content-type'));
await images.dispose(source); // later fetch must fail
```

For EXIF-6 JPEG, compare source metadata's raw dimensions/orientation with the
returned resource's actual display dimensions/coordinateSpace. Repeat with
PNG and TIFF, close while a preview/cache is active, and inspect native process
termination and resource fetch rejection. Record the actual platform/WebView,
CORS, MIME, CSP and resource URL behavior before claiming this manual gate.
Preview URLs are temporary display artifacts and must never be committed to a
document or undo entry. Use LI05 persistent RasterRef integration for that flow.
