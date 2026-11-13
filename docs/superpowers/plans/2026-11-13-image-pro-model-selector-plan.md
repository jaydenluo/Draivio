# Image Pro Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous Image Pro model dropdown with a two-level “服务来源 → 模型” selector that distinguishes Draivio credits, user keys, providers, and OpenAI-compatible endpoints.

**Architecture:** Keep provider/source definitions in a focused module, store the selected `sourceId` alongside the existing model parameter in editor state, and render a reusable popover in both the generation inspector and the AI composer. The UI defaults to a compact source summary and filters model choices by the selected source.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS theme.

---

### Task 1: Add source and model domain data

**Files:**
- Create: `src/creation/modelSources.ts`
- Test: `src/creation/modelSources.test.ts`

- [ ] **Step 1: Write the failing tests** for the source labels, model filtering, and stable source IDs.
- [ ] **Step 2: Run `npm test -- src/creation/modelSources.test.ts --run`** and confirm the new module is missing.
- [ ] **Step 3: Implement `ModelSource`, `SourceModel`, `modelSources`, `getSourceById`, and `getModelsForSource`** with these entries:
  - `draivio-cloud`: `Draivio 云端 · 使用登录积分`, model `Image Pro`, credit billing.
  - `openai-custom`: `OpenAI · 自定义密钥`, model `gpt-image-2.5`, provider billing.
  - `volcengine-custom`: `火山引擎 · OpenAI 兼容`, model `gpt-image-2.5`, provider billing.
- [ ] **Step 4: Run the focused tests and confirm they pass.**
- [ ] **Step 5: Commit `feat: add image model source definitions`.**

### Task 2: Store the selected service source in editor state

**Files:**
- Modify: `src/state/editor.tsx`
- Test: `src/state/editor.test.tsx` (create if no reducer test exists)

- [ ] **Step 1: Add a failing reducer test** asserting the initial source is `draivio-cloud` and selecting `openai-custom` updates `composerSourceId` without changing the model until a model is selected.
- [ ] **Step 2: Run the focused reducer test and confirm it fails.**
- [ ] **Step 3: Add `composerSourceId` to `EditorState`, snapshots, initial state, and `EditorAction`; add `set-composer-source` and update `set-composer-parameter` model values through the source model list.**
- [ ] **Step 4: Run the reducer test and the existing editor tests.**
- [ ] **Step 5: Commit `feat: persist selected image model source`.**

### Task 3: Build the reusable service-source selector

**Files:**
- Create: `src/creation/ModelSourcePicker.tsx`
- Modify: `src/styles/theme.css`
- Test: `src/creation/ModelSourcePicker.test.tsx`

- [ ] **Step 1: Write failing interaction tests** for collapsed summary, opening the source list, selecting a source, opening model choices, and showing provider billing text versus Draivio credit text.
- [ ] **Step 2: Run the focused tests and confirm they fail.**
- [ ] **Step 3: Implement `ModelSourcePicker`** with accessible buttons and a compact two-row presentation:
  - source button shows the selected source display name and billing hint;
  - model button shows the selected model display name;
  - source popover lists all configured sources;
  - model popover lists only models for the selected source;
  - source changes select that source’s first model and expose a notice through the callback.
- [ ] **Step 4: Add focused CSS matching the existing dark inspector/popover language, with no new external UI dependency.**
- [ ] **Step 5: Run the focused tests and confirm they pass.**
- [ ] **Step 6: Commit `feat: add service source picker`.**

### Task 4: Integrate the picker into generation and AI composer flows

**Files:**
- Modify: `src/creation/GenerationPanel.tsx`
- Modify: `src/creation/AIComposer.tsx`
- Modify: `src/creation/AIComposer.test.tsx` (create if missing)
- Modify: `src/creation/Inspector.test.tsx`

- [ ] **Step 1: Add failing integration tests** asserting `OpenAI · 自定义密钥`, `火山引擎 · OpenAI 兼容`, and `Draivio 云端 · 使用登录积分` are rendered through the picker, and that selecting a source updates the request parameters.
- [ ] **Step 2: Run the focused integration tests and confirm they fail.**
- [ ] **Step 3: Replace the raw model `<select>` in `GenerationPanel` with `ModelSourcePicker`; use the selected source/model for the cost row and panel subtitle.**
- [ ] **Step 4: Replace the `model` chip popover in `AIComposer` with the same picker while preserving the existing size/count/strength chips.**
- [ ] **Step 5: Include `sourceId` and `modelCode` in the simulated AI operation request and preserve them in the operation history type.**
- [ ] **Step 6: Run the focused tests and then the complete suite with `npm test -- --run`.**
- [ ] **Step 7: Commit `feat: integrate service source model selection`.**

### Task 5: Verify build and update documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-13-image-pro-model-selector-design.md` only if implementation terminology differs.

- [ ] **Step 1: Run `npm run build` and fix any TypeScript or Vite errors caused by the integration.**
- [ ] **Step 2: Run `npm test -- --run` and record the passing result.**
- [ ] **Step 3: Review `git diff --check` for whitespace errors and inspect the final diff for unrelated changes.**
- [ ] **Step 4: Commit `chore: verify image model selector`.**
