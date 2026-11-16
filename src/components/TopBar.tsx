import "./topBar.css";
import { cloudAccount } from "../account/cloudAccount";
import { useCloudAccount } from "../account/useCloudAccount";
import { CloudAccountDialog } from "../account/CloudAccountDialog";
import { RawControls } from "../raw/RawControls";
import { CmykDialog } from "../color/CmykDialog";
import { SoftProofDialog } from "../color/SoftProofDialog";
import { PrecisionDialog } from "../render/PrecisionDialog";
import { FloatingSurface } from "../ui/FloatingSurface";
import { ProjectFileControl } from "../document/ProjectFileControl";
import { DocumentSizeControl } from "../document/DocumentSizeControl";
import { BillingDialog } from "./BillingDialog";
import { useEditor } from "../state/editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { ServiceSourceSettings } from "../creation/ServiceSourceSettings";
import { serializeExport } from "../render/serializeExport";
import { message } from "../ui/message";
import { ExportDialog } from "../render/ExportDialog";
import { BatchDialog } from "./BatchDialog";
import { decontaminateFringe } from "../masks/refineMask";
import { ArtboardControls } from "../document/ArtboardControls";
import { isTauri } from "@tauri-apps/api/core";
import { AppVersionLabel, WindowControls } from "./WindowControls";

export function TopBar() {
  const { state, dispatch } = useEditor();
  const account = useCloudAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  useEffect(() => {
    if (state.notice && !state.notice.startsWith("已收到第"))
      message.info(state.notice, { key: "editor-notice" });
  }, [state.notice]);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRoot = useRef<HTMLDivElement>(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const closeBilling = useCallback(() => setBillingOpen(false), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [cmykOpen, setCmykOpen] = useState(false);
  const [softProofOpen, setSoftProofOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useEffect(() => {
    const open = () => {
      setAccountOpen(false);
      setSettingsOpen(true);
    };
    const login = () => {
      setAccountOpen(false);
      setLoginOpen(true);
    };
    window.addEventListener("draivio:service-settings", open);
    window.addEventListener("draivio:cloud-login", login);
    return () => {
      window.removeEventListener("draivio:service-settings", open);
      window.removeEventListener("draivio:cloud-login", login);
    };
  }, []);
  useEffect(() => {
    if (!accountOpen) return;
    accountRoot.current
      ?.querySelector<HTMLButtonElement>(
        ".account-popover button:not(:disabled)",
      )
      ?.focus();
    const pointerdown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !accountRoot.current?.contains(event.target)
      )
        setAccountOpen(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setAccountOpen(false);
        accountRoot.current
          ?.querySelector<HTMLButtonElement>(".avatar")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", pointerdown);
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("pointerdown", pointerdown);
      document.removeEventListener("keydown", keydown, true);
    };
  }, [accountOpen]);
  const toggleAccount = () => setAccountOpen((open) => !open);
  const hasHighPrecision = state.layers.some((layer) =>
    Boolean(layer.highPrecision),
  );
  const exportSource = (range: "canvas" | "selection" | "layer") => {
    const svg = document.querySelector(".canvas-art");
    if (!svg) return "";
    return serializeExport(svg as SVGSVGElement, {
      range,
      selectedLayerId: state.selectedLayerId,
      selection: state.selectionVisible ? state.selection : undefined,
      cropRect: state.cropRect,
    });
  };
  const pixelPostProcess = (
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    range: "canvas" | "selection" | "layer",
  ) => {
    const refinement = state.layerMasks[state.selectedLayerId]?.refinement;
    if (
      range !== "layer" ||
      !refinement?.colorCorrection ||
      refinement.decontaminate <= 0
    )
      return rgba;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    return decontaminateFringe(
      rgba,
      alpha,
      width,
      height,
      refinement.decontaminate,
      refinement.colorCorrection,
    );
  };
  const isDesktopRuntime =
    isTauri() &&
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window;
  const usesNativeMacControls =
    isDesktopRuntime &&
    /Macintosh|Mac OS X/.test(
      typeof navigator === "undefined" ? "" : navigator.userAgent,
    );
  return (
    <>
      <header
        className={`topbar app-titlebar${usesNativeMacControls ? " app-titlebar-macos" : ""}`}
        data-tauri-drag-region
      >
        <div className="brand app-titlebar-brand" data-tauri-drag-region>
          <span className="brand-mark app-titlebar-mark" aria-hidden="true" />
          <span className="app-titlebar-wordmark">Draivio</span>
          <span className="app-titlebar-name">AI 图片创作</span>
          <AppVersionLabel isDesktopRuntime={isDesktopRuntime} />
        </div>
        <div className="app-titlebar-content">
          <ProjectFileControl />
          <details className="topbar-more">
            <summary className="top-button">更多工具</summary>
            <div className="topbar-tools-panel">
              <RawControls />
              <button className="top-button" onClick={() => setBatchOpen(true)}>
                批量处理
              </button>
              <ArtboardControls />
              <DocumentSizeControl />
              <button className="top-button" onClick={() => setCmykOpen(true)}>
                文档模式 / CMYK
              </button>
              <button
                className="top-button"
                aria-pressed={state.proofSettings.enabled}
                onClick={() => setSoftProofOpen(true)}
              >
                校样颜色
              </button>
              <button
                className="top-button"
                onClick={() => setPrecisionOpen(true)}
              >
                高精度资源
              </button>
            </div>
          </details>
          <div className="top-actions">
            <button
              className="balance top-button"
              onClick={() =>
                account.authenticated
                  ? setBillingOpen(true)
                  : setLoginOpen(true)
              }
              title={
                account.authenticated ? "查看实际账户余额" : "登录共用云端账号"
              }
            >
              {account.authenticated && account.balance !== null
                ? `${account.balance.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 积分`
                : "登录云端"}
            </button>
            <button
              className="top-button"
              onClick={() => {
                if (state.colorModel === "cmyk") setCmykOpen(true);
                else if (!document.querySelector(".canvas-art"))
                  dispatch({ type: "set-notice", message: "没有可导出的画布" });
                else setExportOpen(true);
              }}
            >
              导出
            </button>
            <div className="account-wrap" ref={accountRoot}>
              <button
                className="avatar"
                title="账户与设置"
                aria-label="账户设置"
                aria-expanded={accountOpen}
                onClick={toggleAccount}
              >
                {account.user?.email.slice(0, 2).toUpperCase() || "登录"}
              </button>
              {accountOpen ? (
                <FloatingSurface
                  className="account-popover"
                  role="dialog"
                  aria-label="账户设置"
                  title="账户与设置"
                  onClose={() => setAccountOpen(false)}
                  closeLabel="关闭账户设置"
                >
                  {account.authenticated ? (
                    <p className="account-email">{account.user?.email}</p>
                  ) : (
                    <button
                      className="account-menu-item"
                      aria-label="登录 / 注册"
                      onClick={() => {
                        setAccountOpen(false);
                        setLoginOpen(true);
                      }}
                    >
                      登录 / 注册
                    </button>
                  )}
                  <button
                    className="account-menu-item"
                    aria-label="服务来源"
                    onClick={() => {
                      setAccountOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <AccountMenuIcon kind="sources" />
                    <span className="account-menu-copy">
                      <span className="account-menu-title">服务来源</span>
                      <span className="account-menu-description">
                        管理平台、密钥与模型生成设置
                      </span>
                    </span>
                  </button>
                  <button
                    className="account-menu-item"
                    aria-label="云服务充值"
                    onClick={() => {
                      setAccountOpen(false);
                      setBillingOpen(true);
                    }}
                  >
                    <AccountMenuIcon kind="billing" />
                    <span className="account-menu-copy">
                      <span className="account-menu-title">云服务充值</span>
                      <span className="account-menu-description">
                        查看实际余额与账户状态
                      </span>
                    </span>
                  </button>
                  <div className="account-menu-divider" />
                  <button
                    className="account-menu-item account-menu-item--logout"
                    aria-label="退出登录"
                    disabled={!account.authenticated}
                    onClick={() => {
                      setAccountOpen(false);
                      void cloudAccount
                        .logout()
                        .catch(() =>
                          message.error(
                            "本机已退出，云端会话撤销失败，请稍后重试",
                          ),
                        );
                    }}
                  >
                    <AccountMenuIcon kind="logout" />
                    <span className="account-menu-copy">
                      <span className="account-menu-title">退出登录</span>
                      <span className="account-menu-description">
                        {account.authenticated
                          ? "退出本次云端会话"
                          : "当前未登录"}
                      </span>
                    </span>
                  </button>
                </FloatingSurface>
              ) : null}
            </div>
          </div>
        </div>
        <WindowControls />
        <span className="sr-only">当前缩放 {state.zoom}%</span>
        {settingsOpen ? (
          <ServiceSourceSettings onClose={closeSettings} />
        ) : null}
        {billingOpen ? (
          <BillingDialog
            onClose={closeBilling}
            onLogin={() => {
              setBillingOpen(false);
              setLoginOpen(true);
            }}
          />
        ) : null}
        {loginOpen ? <CloudAccountDialog onClose={closeLogin} /> : null}
      </header>
      {cmykOpen ? <CmykDialog onClose={() => setCmykOpen(false)} /> : null}
      {softProofOpen ? (
        <SoftProofDialog onClose={() => setSoftProofOpen(false)} />
      ) : null}
      {precisionOpen ? (
        <PrecisionDialog onClose={() => setPrecisionOpen(false)} />
      ) : null}
      {batchOpen ? (
        <BatchDialog
          adjustmentPresets={state.adjustmentPresets}
          onClose={() => setBatchOpen(false)}
        />
      ) : null}
      <ExportDialog
        hasHighPrecision={hasHighPrecision}
        renderingIntent={state.colorManagement.renderingIntent}
        colorProfile={state.colorManagement.profile}
        open={exportOpen}
        svgSource={exportSource}
        documentWidth={state.documentWidth}
        documentHeight={state.documentHeight}
        hasSelection={state.selectionVisible}
        selectionWidth={Math.max(
          1,
          Math.round((state.documentWidth * state.selectionRect.width) / 100),
        )}
        selectionHeight={Math.max(
          1,
          Math.round((state.documentHeight * state.selectionRect.height) / 100),
        )}
        selectedLayerName={
          state.layers.find((layer) => layer.id === state.selectedLayerId)?.name
        }
        pixelPostProcess={pixelPostProcess}
        onClose={() => setExportOpen(false)}
        onExport={(range) =>
          dispatch({
            type: "set-notice",
            message: `已导出${range === "selection" ? "选区" : range === "layer" ? "当前图层" : "画布"}`,
          })
        }
      />
    </>
  );
}

function AccountMenuIcon({ kind }: { kind: "sources" | "billing" | "logout" }) {
  return (
    <svg
      className="account-menu-icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "sources" ? (
        <>
          <rect x="3" y="4" width="18" height="6" rx="2" />
          <rect x="3" y="14" width="18" height="6" rx="2" />
          <path d="M7 7h.01M7 17h.01M15 7h3M15 17h3" />
        </>
      ) : kind === "billing" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18M7 15h4" />
        </>
      ) : (
        <>
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h13" />
        </>
      )}
    </svg>
  );
}
