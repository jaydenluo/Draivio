# Draivio 自动更新与 GitHub 多端发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Tauri 桌面端接入签名自动更新，并在 GitHub 标签发布时自动构建 Windows 与 macOS 安装包。

**Architecture:** 前端只在 Tauri 运行时按 24 小时节流检查更新；更新检查、下载进度和重启由独立的 `src/update` 模块负责。Tauri updater 使用签名公钥，私钥只由 GitHub Actions Secrets 提供；release workflow 通过 Tauri 配置 overlay 写入仓库端点，避免在未绑定 GitHub 仓库前硬编码地址。

**Tech Stack:** Tauri 2, `tauri-plugin-updater`, `tauri-plugin-process`, React, Vitest, GitHub Actions。

---

### Task 1: 更新控制器

**Files:**
- Create: `src/update/updateClient.ts`
- Test: `src/update/updateClient.test.ts`

- [x] Write tests for desktop gating, 24-hour throttling, successful install progress, and failure propagation.
- [x] Implement dependency-injected update controller and storage-safe check timestamp handling.
- [x] Run the focused Vitest test.

### Task 2: 桌面更新提示

**Files:**
- Create: `src/update/UpdateManager.tsx`
- Create: `src/styles/update.css`
- Modify: `src/app/AppShell.tsx`
- Test: `src/update/UpdateManager.test.tsx`

- [x] Add a compact Chinese update dialog with later/download/restart actions and progress.
- [x] Start a delayed background check only in Tauri and keep check failures non-blocking.
- [x] Mount it once in the application shell and test the available/update/install states.

### Task 3: Tauri updater wiring

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/tauri.conf.json`

- [x] Register updater and process plugins, permissions, signing public key, and updater artifacts.
- [x] Keep the base config endpoint as a documented placeholder; release overlay provides the final GitHub endpoint.

### Task 4: GitHub 发布流水线与文档

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `src-tauri/tauri.release.conf.json`
- Create: `docs/release/desktop-release.md`
- Modify: `README.md`

- [x] Build macOS universal and Windows x64 packages from `v*` tags.
- [x] Pass signing secrets and generate `latest.json` updater artifacts.
- [x] Document key generation, GitHub Secrets, tag release, endpoint behavior, and local verification.

### Verification

- [x] Run focused update tests.
- [x] Run `npm run build`.
- [x] Run `cargo check --manifest-path src-tauri/Cargo.toml`.
- [x] Run `npx tauri build --debug --no-bundle`.
- [x] Run `git diff --check`.
