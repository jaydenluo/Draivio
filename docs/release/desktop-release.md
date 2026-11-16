# Draivio 桌面版发布与自动更新

Draivio 使用 Tauri 2 的签名 updater。应用启动后会在桌面运行时延迟检查更新，每 24 小时最多检查一次；发现新版本后由用户选择“现在更新”，下载完成后自动安装并重启。浏览器预览不会请求更新服务，检查失败也不会阻塞编辑器。

## 第一次配置 GitHub

1. 在 GitHub 创建公开仓库并把当前项目推送上去。
2. 使用与 `src-tauri/tauri.conf.json` 中公钥匹配的签名私钥（私钥不要提交）。本工作区已在 `/Users/szys/.config/draivio/tauri-updater.key` 生成匹配私钥，可直接读取其内容填入 Secret；如果你重新生成密钥，必须同时替换配置里的公钥：

   ```bash
   npx tauri signer generate --write-keys ~/.config/draivio/tauri-updater.key
   ```

3. 在 GitHub 仓库 `Settings → Secrets and variables → Actions` 添加：

   - `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整内容（例如 `cat /Users/szys/.config/draivio/tauri-updater.key` 的输出）
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时设置的密码；没有密码时保留为空

   `src-tauri/tauri.conf.json` 中提交的是公钥，可以公开。私钥、密码和用户 API Key 都不能进入 Git 历史、Issue 或日志。

## 发布新版本

保持 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 的版本一致，然后创建并推送标签：

```bash
git tag v0.1.1
git push origin v0.1.1
```

`.github/workflows/release.yml` 会分别构建 macOS Universal（DMG/App）和 Windows x64（NSIS/安装程序），并上传签名 updater 文件与 `latest.json` 到 GitHub Release。当前更新地址为 `https://github.com/jaydenluo/Draivio/releases/latest/download/latest.json`。构建前的 `scripts/prepare-tauri-release.mjs` 会根据 Actions 的 `GITHUB_REPOSITORY` 自动生成正确的 GitHub 更新端点，所以仓库改名后不需要手动改客户端代码。

## 本地验证

```bash
npm test -- --run src/update/updateClient.test.ts src/update/UpdateManager.test.tsx
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npx tauri build --debug --no-bundle
```

`--no-bundle` 只能验证编译，不能验证签名安装。要验证完整更新流程，需要在 GitHub Actions 构建一个较低版本，发布更高版本后安装旧包，再检查更新提示、下载、重启和版本号。
