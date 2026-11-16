# R04 — real non-destructive layer adjustments

Task: `92116dc7-a664-47f2-918e-8afa9d501a98`, repair R04. Supplemental review findings repaired; implementation ready for independent review; human acceptance and native raster comparison remain outstanding. No source assets are overwritten. Existing reducer owns parameter reset/history/locking; its adjustment branch now rejects non-finite values with feedback and no history entry. This change only replaces presentation approximations with a shared SVG filter pipeline and a deterministic CPU reference.

## Algorithms and supported domain

Input/output: encoded 8-bit sRGB RGBA, no color-profile conversion, linear-light conversion, HDR or perceptual color-space processing. All signed parameters clamp to -100…100, with normalized `a = value / 100`; non-finite values are neutral. Blur has the useful range 0…100 (negative legacy values produce zero blur). All-zero state bypasses filtering altogether, preserving bytes exactly, including invisible RGB. Spatial effects preserve original coverage/alpha rather than spreading coverage into transparent pixels.

Order is transfer LUT, saturation, clarity, blur. `layerAdjustments.ts` owns LUT generation and finite Gaussian kernels; `AdjustmentFilter.tsx` serializes the same values into the scene/export SVG. LUTs contain 256 samples, interpolated by SVG between sample values; CPU reference inputs are bytes and therefore land on exact samples.

1. Brightness: `v = clamp(v * (1 + a))`.
2. Contrast: `v = clamp((v - .5) * (1 + a) + .5)`.
3. Temperature: multiply red by `2 ** (.5*a)`, blue by `2 ** (-.5*a)`, green unchanged, then clamp. Positive warms, negative cools. This is an explicit channel-gain approximation to white balance, with no sepia or hue rotation; it is not calibrated Kelvin/CCT or chromatic adaptation.
4. Shadows/highlights: after preceding transfers, compute `ws=max(0,1-2*v)^2`, `wh=max(0,2*v-1)^2`; output `clamp(v + .5*shadows*ws + .5*highlights*wh)`. Shadows affect the lower channel half and highlights the upper half; midgray remains stable. These are channel tone curves, so colored pixels can change hue; this is not a luminance-preserving photographic recovery operator.
5. Saturation: `L=.2126R+.7152G+.0722B`, output `clamp(L+(1+a)*(channel-L))`. SVG uses the exact explicit matrix rather than the slightly different built-in saturation coefficients.
6. Clarity (`sharpness` parameter): finite Gaussian low pass at sigma 6 document pixels (25×25 support); `clamp(original + .8*a*(original-lowpass))`. Positive strengthens local edges, negative softens; flat fields retain brightness. The broader lowpass produces local contrast across a 12-pixel radius rather than narrow sigma-1/radius-2 edge sharpening. It is a fixed-scale local contrast approximation, not an adaptive or multiscale photographic clarity model.
7. Blur: finite Gaussian at sigma `3*max(0,a)` document pixels; support radius `ceil(2*sigma)`. Zero bypasses. Kernel weights are normalized over the square support.

Convolution samples outside image/filter input as transparent (`edgeMode=none`), weights each color by sample alpha, normalizes by accumulated alpha, and restores original alpha. SVG performs premultiplied convolution (`preserveAlpha=false`), makes its unpremultiplied result opaque, then composites it into SourceAlpha. This avoids dark RGB halos from empty transparent neighbors. Filter region pads the document by 24 pixels (maximum composed kernel support is eighteen); final SVG document clipping remains authoritative. Filters run in document coordinates after the layer transform; CPU fixtures are untransformed pixel arrays with one array pixel per document pixel.

## Integration and preservation

`CanvasScene` references a named SVG filter and embeds its definitions in each layer; document export clones that exact SVG. Existing isolated group compositing, opacity, masks, transformed content, and thumbnails retain their shared scene path. Visual selected-layer extraction retains ancestors and definitions. Raster-source extraction now removes both CSS and SVG filter attributes on the selected layer, preserving its non-destructive parameter state for later rendering and preventing double application. Child layer filters remain when rasterizing a group, matching existing descendant compositing behavior.

## Supplemental UI and input repair

The compact adjustment section now provides eight independently labeled reset buttons and a per-layer preview checkbox. Numeric controls retain the workspace 24px control token; reset buttons are 24px tall. Resetting one value preserves all others and enters undo history. Blur UI now uses 0…100. Parent and direct locks disable editing/reset/preview.

`adjustmentsEnabled` defaults to enabled when absent. Toggling it is an undoable document setting; it does not replace or erase stored numeric parameters. The scene, layer thumbnails and export all follow that setting, explicitly stated beside the switch as “导出跟随预览”. Preview off therefore exports the unadjusted layer while retaining saved values; re-enabling restores the exact values. Non-finite direct adjustment actions (`NaN`, `±Infinity`) preserve values and history, with the notice “调整值必须是有限数字，已保留原值”.

Supplemental red run: four failures for missing broad local contrast, NaN rejection, undoable preview and export bypass. UI test failed for missing individual reset controls before implementation. Final fixtures include a 21-pixel strip with a 9-pixel-wide RGB160 plateau on RGB100; its center lies five pixels from each edge. At clarity +70, finite sigma6 local average is approximately 135.6825 and output rounds to RGB174; at -70 it rounds to RGB146. Sigma1/radius2 sharpening leaves the same center RGB160. This scale distinction is directly tested.

## Evidence

Test-first CPU run with an identity placeholder: five expected behavior failures (brightness, saturation, temperature, tonal controls, spatial controls), exit 1. Test-first SVG run with null placeholder: missing named-filter/pipeline/export assertions failed, exit 1; an initial fixture-filter selector was narrowed to adjustment definitions.

Final focused command:

`npx vitest run src/imaging/layerAdjustments.test.ts src/canvas/AdjustmentFilter.test.tsx src/canvas/CanvasScene.test.tsx src/canvas/layerExtraction.test.tsx src/layers/PropertiesPanel.adjustments.test.tsx src/layers/PropertiesPanel.history.test.tsx src/layers/PropertiesPanel.pixels.test.tsx`

Result: 7 files, 42 tests passed; actual exit 0. Fixtures cover color card, gray ramp, texture, combined controls, alpha/transparent neighbors, exact neutral identity, immutable source, reset/undo parameters, SVG shared tables/kernels and selected extraction. `npm run build`: actual exit 0 (TypeScript and Vite production build). Build emitted the existing >500kB bundle advisory; it exited 0. Earlier TypeScript typed-array generic mismatch was corrected before final verification.

## Evidence limits and remaining work

Pure pixel fixtures verify the CPU algorithms; DOM tests verify emitted SVG primitives, parameter sharing and export preservation. They do **not** prove native browser/WebKit bitmap equality. SVG engines may introduce intermediate quantization, premultiplication rounding, interpolation/resampling, or implementation-specific convolution behavior. No numeric native tolerance is asserted without an observed native raster comparison. Independent acceptance should rasterize fixed color/alpha cards through the production browser or Tauri/WebKit export path and compare decoded PNG pixels with the CPU reference, recording engine/version and measured tolerance. Source image color management, transformed/antialiased content, document scaling and large-kernel performance need native visual coverage. Parameter histories remain non-destructive; no commit/push/API requests were made by this repair worker.

## Persistence validation follow-up

Independent review found that the new optional `adjustmentsEnabled` flag was preserved by serialization but had no runtime type guard. Added an optional-boolean validation guard in `projectValidation.ts`. A project-format regression verifies that `false` round trips while retaining brightness 35 and rejects malformed flags `'false'`, `'true'`, `0`, `1`, and `null`. Missing flags remain supported for existing projects (enabled by default). Red run: 14 passed/1 failed because malformed string flags were accepted, actual exit 1. Green run `npx vitest run src/document/projectFormat.test.ts`: 15 passed, actual exit 0. `npm run build`: actual exit 0, >500kB bundle advisory remains.

Independent reviewer reported CPU reference timings of approximately 1115ms for 128² and 4966ms for 256² images with spatial operations. These timings were supplied by the reviewer rather than reproduced in this worker. The CPU reference is deliberately test/verification code and is not the interactive canvas path. Production SVG still uses finite 25×25 clarity plus up to 13×13 blur kernels; native rendering cost may be significant. Native performance, interactive smoothness, and browser/WebKit raster pixel equality remain pending acceptance evidence. No native performance or equivalence completion claim is made.

## Actual browser failure, diagnosis, and separable repair

The main reviewer exported eleven production PNGs through IAB UI. Initial clarity was a real failed acceptance: maxima 35 at clarity35 and 57 at clarity70; no tolerance was increased. Default export white background explains alpha differences, so the offline comparator now supports `--white-background` and has an independent white-composition test. With white composition neutral is exact, scalar-control maxima are 1–2, blur35 max2, blur100 max3, while clarity remains failed. Those are observed IAB results, not Tauri/WebKit results.

The reviewer then operated the standalone diagnostic HTML through UI and downloaded four PNGs. Offline comparison is recorded with file SHA256 hashes and pixel samples in `fixtures/adjustment-native-convolution-diagnosis.json`. **Dense sigma6/order25×25 matches identity in all 16384 RGBA bytes (max0, mean0, nonzero0)**. Equivalent separable25×1→1×25 differs from identity in 11187 bytes, max122/mean19.1187. Order13×13 also works. Actual production SVG properties and normalized weights are correct, ruling out missing attributes/serialization. This establishes that this browser's large dense convolution path does not apply the intended operation; the engine's exact internal cutoff or fallback mechanism is not inferred from this test.

Repair uses normalized 1-D Gaussian kernels along horizontal then vertical axes. Premultiplied colors and convolved alpha pass through both axes without restoring coverage or normalizing between them; normalization and original-alpha restoration happen after the complete convolution. The CPU reference uses the same separable mathematics and retains the dense outer-product helper for reference/diagnostics. Every one of the eleven 64px reference cards is byte-identical before and after this CPU optimization. An additional independently implemented dense alpha-weighted test checks a partial-alpha card within one byte, while exact plateau expectations 174/146 remain unchanged. New red SVG regression expected orders25×1/1×25 but observed25×25 before repair; after repair 8 files/46 tests passed, actual exit0. Production build actual exit0 with the existing bundle-size advisory.

A fresh local CPU-only run at clarity70+blur100 measured 19.697ms for128² and46.995ms for256², recorded in `fixtures/adjustment-reference-timings.json`; benchmark artifact test passed exit0. These single-run CPU numbers do not establish native interactive performance. Production browser re-export after this repair remains necessary, and Tauri/WebKit pixel/performance checks remain outstanding. The main reviewer is preparing a new static build for that fresh browser acceptance; old pre-repair PNGs cannot establish success.
