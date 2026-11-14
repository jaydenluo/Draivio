# Model manager integration

Status: ready for review; local main integration authorized by user.

Scope: optional model manager, separate cutout and upscale menus, existing basic pixel processing actions. No unrelated workspace changes included.

Changed files: src/models/*, src/imaging/enhancement.ts, src/imaging/enhancement.test.ts, src/tools/toolTypes.ts, src/tools/toolRegistry.ts, src/tools/toolRegistry.test.ts, src/state/editor.tsx, src/components/ToolOptionsBar.tsx, src/app/AppShell.tsx, src/canvas/CanvasViewport.tsx, src/canvas/rasterTools.ts, src-tauri/src/models.rs, src-tauri/src/lib.rs, src-tauri/Cargo.toml, src-tauri/Cargo.lock.

Validation: npm test -- --run: 162 tests passed, exit 0. npm run build: passed, exit 0. git diff --check: passed, exit 0.

Remaining issues: actual U2Net/RMBG/Real-ESRGAN inference is not implemented; existing processing uses connected background removal and nearest-neighbor scaling. Native pause is a placeholder; SHA256 verification is not wired into downloads; RMBG download is unconfigured. No release installer has been rebuilt. These limitations prevent claiming model-based tools are complete.
