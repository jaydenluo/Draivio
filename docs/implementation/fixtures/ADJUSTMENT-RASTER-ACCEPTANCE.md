# 64px adjustment raster acceptance artifacts

These artifacts prepare real browser/Tauri export comparison. They do not themselves prove any browser export passed. No product code is changed by their generation.

Open `adjustment-colorcard-64.draivio` in Draivio. Its only layer (`card`) is an embedded 64×64 PNG at 100% opacity, normal blending, no transform, zero adjustments, preview enabled. Background is transparent, selection hidden, with no groups, masks, text, shapes, or strokes. Project decoding and offline encode/decode roundtrip are checked by the artifact test. Source `adjustment-colorcard-64.png` and unpremultiplied bytes `adjustment-colorcard-64.rgba` are adjacent.

The card has four 16px horizontal bands: gray ramp; eight color patches; warm-colored alpha ramp with empty edges; broad contrast plateau and fine texture. Alpha is intentionally partial in band three. Fully transparent source pixels retain hidden RGB, which canvas encoders may discard; use `visible_rgb` and `alpha` as well as raw RGBA statistics.

For each case, start from neutral (all-reset), leave preview enabled, set only the specified control, then export **PNG at original 64×64**. Do not scale, flatten onto an opaque background, transform, or combine settings. Native UI export/download must be performed and observed separately. Values and filenames:

| Case | Control | Value |
| --- | --- | --- |
| neutral | All | 0 |
| brightness35 | 亮度 | 35 |
| contrast35 | 对比度 | 35 |
| saturation35 | 饱和度 | 35 |
| temperature35 | 色温 | 35 |
| sharpness35 | 清晰度 | 35 |
| blur35 | 模糊 | 35 |
| shadows35 | 阴影 | 35 |
| highlights35 | 高光 | 35 |
| blur100 | 模糊 | 100 |
| clarity70 | 清晰度 | 70 |

`adjustment-expected/manifest.json` records all exact parameters. Each case has deterministic CPU reference `.rgba` and a convenience `.png`; these PNGs are CPU outputs, not browser downloads. Expected pixels import production `applyLayerAdjustments` so changing that algorithm requires regenerating artifacts. Browser/CPU matching is what the comparison is intended to independently measure.

From the worktree root, regenerate and validate:

```sh
python3 docs/implementation/fixtures/adjustment-raster-tools.py generate
npx vitest run docs/implementation/fixtures/adjustment-raster-artifacts.test.ts
python3 docs/implementation/fixtures/adjustment-raster-tools.py previews
python3 docs/implementation/fixtures/adjustment-raster-tools-test.py
```

Compare an actually downloaded PNG (absolute download path can be anywhere):

```sh
python3 docs/implementation/fixtures/adjustment-raster-tools.py compare '/absolute/path/export.png' clarity70
```

Output contains max/mean/count/nonzero absolute channel deltas for all RGBA, RGB where both pixels have positive alpha, RGB where both are opaque, and alpha independently. It checks 64×64 dimensions and PNG CRC. It does not apply an invented tolerance or mark acceptance. Save the emitted JSON as evidence alongside the actual downloaded PNG, case, browser engine/version, app revision, and export settings. No downloaded browser PNG has been compared in this worker.

Optional standalone decoder:

```sh
python3 docs/implementation/fixtures/adjustment-raster-tools.py decode '/absolute/path/export.png' '/absolute/path/export.rgba'
```

The decoder uses Python standard library only. It supports noninterlaced 8-bit RGBA, RGB, grayscale, grayscale+alpha, and indexed PNG, all five PNG row filters. It returns decoded unpremultiplied channel bytes without color-profile conversion. Interlaced or non-8-bit output is rejected explicitly. Two decoder self-tests verify all five row filters against known independent bytes and verify source/neutral identity. Artifact validation and decoder self-tests passed; native export pixels and native performance remain pending.

## White-background exports and clarity diagnosis

The main reviewer performed production IAB PNG downloads. ExportDialog's default background was white, so those downloads must be compared with CPU pixels composited onto white rather than transparent CPU RGBA:

```sh
python3 docs/implementation/fixtures/adjustment-raster-tools.py compare '/absolute/path/export.png' clarity70 --white-background
```

Three standard-library decoder/compositing self-tests pass. White composition reduces the neutral reference to exact identity and explains prior alpha differences; it does not explain clarity failures. The reviewer-provided 11 actual downloads were decoded offline in this worker. Observed full RGB maxima were 0 neutral; 1–2 for scalar adjustments; 2 blur35; 3 blur100; **35 clarity35 and 57 clarity70**. Clarity remains failed, with no tolerance relaxation. Raw local comparison output was saved in `/tmp/draivio-native-adjustment-white-comparisons.json` for the main reviewer.

The actual reviewer-exported production SVG contains the expected sRGB filter, `order="25 25"`, 625 normalized weights, proper `kernelMatrix`, `preserveAlpha="false"`, `edgeMode="none"`, and arithmetic coefficients `k2=1.56`, `k3=-0.56`; serialization did not lose them. Actual clarity PNGs are nearly identical to source even at fine texture where CPU contrast increases by 35 levels. This suggests large-kernel convolution is being bypassed by the renderer; it is a hypothesis pending the diagnostic below, not a confirmed root cause.

`adjustment-convolution-diagnostic.html` displays four embedded 64px SVG images and explicit “导出诊断 NAME” buttons. Buttons locally rasterize their image to white-backed 64px PNG via canvas, then download. Cases compare identical source and coverage treatment with a 25×25 sigma6 convolution, mathematically equivalent separable 25×1 then 1×25 convolution, 13×13 sigma3 convolution, and identity. The page uses embedded assets without network calls. It is a diagnostic artifact, not production acceptance. The main reviewer must operate those buttons via CUA and supply actual downloaded PNG paths for analysis; this worker does not operate a browser.

The diagnostic has now been performed by the main reviewer: actual dense25 output is byte-identical to identity; separable25 and dense13 correctly differ. See `adjustment-native-convolution-diagnosis.json` for exact observed pixel statistics and file hashes. Production now uses the separable two-pass Gaussian, and CPU fixtures are byte-identical across the optimization. Fresh **production** exports are still required after the repair; standalone diagnostic success does not satisfy that acceptance.
