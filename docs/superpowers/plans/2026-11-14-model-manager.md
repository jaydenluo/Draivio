# Model Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional local model installation for cutout and upscaling tools with resumable background downloads, integrity verification, and visible UI status.

**Architecture:** A typed frontend model catalog and state machine expose model status to tools and dialogs. Tauri Rust owns application-data paths, resumable HTTP downloads, retries, and SHA256 verification through commands; the browser path uses an in-memory adapter for tests. The first slice implements resource management and install UX, leaving inference execution behind a stable model-installed contract.

**Tech Stack:** React, TypeScript, Vitest, Tauri 2, Rust, reqwest, serde, SHA-256 hashing.

---

### Task 1: Define the model catalog and state machine

**Files:**
- Create: `src/models/modelCatalog.ts`
- Create: `src/models/modelManager.ts`
- Test: `src/models/modelManager.test.ts`

- [ ] **Step 1: Write failing tests** for all five model descriptors, valid transitions, task de-duplication, and terminal install state.
- [ ] **Step 2: Run `npm test -- src/models/modelManager.test.ts` and verify the new module tests fail because the modules do not exist.
- [ ] **Step 3: Implement typed catalog records and a pure reducer/store with `uninstalled`, `queued`, `downloading`, `verifying`, `installed`, `paused`, `failed`, and `outdated` states.
- [ ] **Step 4: Re-run the focused test and verify it passes.
- [ ] **Step 5: Commit `feat: add local model catalog state`.

### Task 2: Add the native model storage and download commands

**Files:**
- Create: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: Rust module tests in `src-tauri/src/models.rs`

- [ ] **Step 1: Add Rust tests for application-data path isolation, SHA256 verification, and Range header calculation.
- [ ] **Step 2: Run `cargo test --manifest-path src-tauri/Cargo.toml models` and verify the new tests fail before implementation.
- [ ] **Step 3: Implement model manifest payloads, app-data model paths, temporary-file handling, and Tauri commands for `model_status`, `model_download`, `model_pause`, `model_cancel`, and `model_delete`.
- [ ] **Step 4: Implement resumable reqwest downloads using the existing byte count, fallback restart when the server rejects Range, bounded retry, progress events, and SHA256 validation before atomic rename.
- [ ] **Step 5: Register commands and run the focused Rust tests until they pass.
- [ ] **Step 6: Commit `feat: add resumable native model downloads`.

### Task 3: Add the frontend native/browser adapter

**Files:**
- Create: `src/models/modelApi.ts`
- Test: `src/models/modelApi.test.ts`

- [ ] **Step 1: Write tests for browser fallback status, native command invocation, progress event normalization, and error mapping.
- [ ] **Step 2: Run `npm test -- src/models/modelApi.test.ts` and verify failure.
- [ ] **Step 3: Implement `modelApi` with `isTauri()` dispatch, in-memory browser adapter, typed progress subscription, and `ensureModelInstalled(modelId)`.
- [ ] **Step 4: Re-run the focused test and verify it passes.
- [ ] **Step 5: Commit `feat: expose model manager adapter`.

### Task 4: Build the model manager UI

**Files:**
- Create: `src/models/ModelManagerDialog.tsx`
- Create: `src/models/model-manager.css`
- Test: `src/models/ModelManagerDialog.test.tsx`
- Modify: `src/components/SettingsDialog.tsx` or the existing settings entry point

- [ ] **Step 1: Write tests for install prompts, model selection, progress, pause/resume, failure messaging, and installed state.
- [ ] **Step 2: Run `npm test -- src/models/ModelManagerDialog.test.tsx` and verify failure.
- [ ] **Step 3: Implement accessible dialog and model cards with size, required space, license link, status, progress, and actions.
- [ ] **Step 4: Add a settings entry for opening the manager and ensure closing the dialog does not cancel downloads.
- [ ] **Step 5: Run the focused tests and verify they pass.
- [ ] **Step 6: Commit `feat: add model manager dialog`.

### Task 5: Add independent cutout/upscale tool entry points

**Files:**
- Modify: `src/tools/toolRegistry.ts`
- Modify: `src/state/editor.tsx` if a tool union entry is required
- Modify: `src/components/ToolRail.tsx`
- Modify: `src/components/ToolOptionsBar.tsx`
- Test: existing tool registry/rail/options tests plus new assertions

- [ ] **Step 1: Add failing tests that verify separate 扣图 and 超分 tools are visible and invoke the correct model requirement.
- [ ] **Step 2: Run the focused tool tests and verify failure.
- [ ] **Step 3: Add the two independent tools and wire first-use clicks to the model manager dialog; show installed/model-needed status in the options bar.
- [ ] **Step 4: Keep both tools independent and do not add a combined one-click workflow.
- [ ] **Step 5: Run the focused tool tests and verify they pass.
- [ ] **Step 6: Commit `feat: add cutout and upscale entries`.

### Task 6: Verify the complete feature

**Files:**
- Modify: `README.md` with model installation notes if needed

- [ ] **Step 1: Run `npm test`.
- [ ] **Step 2: Run `npm run build`.
- [ ] **Step 3: Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] **Step 4: Run `git diff --check` and inspect changed files for unrelated edits.
- [ ] **Step 5: Commit any documentation-only changes as `docs: explain optional model installation`.

