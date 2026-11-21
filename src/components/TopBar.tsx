import { SoftwareSettings } from './SoftwareSettings'
import { ApplicationMenu } from '../commands/ApplicationMenu'
import { ShortcutSettings } from '../commands/ShortcutSettings'
import { commands, COMMAND_EVENT, matchesShortcut, runCommand, formatShortcut, shortcutFor, useShortcutVersion, isShortcutTextTarget } from '../commands/shortcuts'
import { executeEditorCommand } from '../commands/editorCommands'
import "./topBar.css";
import { CreativeTools } from "./CreativeTools";
import { cloudAccount } from "../account/cloudAccount";
import { useCloudAccount } from "../account/useCloudAccount";
import { CloudAccountDialog } from "../account/CloudAccountDialog";
import { RawControls } from "../raw/RawControls";
import { CmykDialog } from "../color/CmykDialog";
import { SoftProofDialog } from "../color/SoftProofDialog";
import { PrecisionDialog } from "../render/PrecisionDialog";
import { AnchoredWindow } from "../ui/AnchoredWindow";
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

export function TopBar({ compact = false }: { compact?: boolean } = {}) {
  useShortcutVersion()
  const { state, dispatch } = useEditor();
  const account = useCloudAccount();
  const [loginOpen, setLoginOpen] = useState(false);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  useEffect(() => {
    if (state.notice && !state.notice.startsWith("已收到第"))
      message.info(state.notice, { key: "editor-notice" });
  }, [state.notice]);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const [billingOpen, setBillingOpen] = useState(false);
  const closeBilling = useCallback(() => setBillingOpen(false), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [softwareSettingsOpen, setSoftwareSettingsOpen] = useState(false);
  const closeSoftwareSettings = useCallback(() => setSoftwareSettingsOpen(false), []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [creativeToolsOpen, setCreativeToolsOpen] = useState(false);
  const moreToolsRoot = useRef<HTMLDivElement>(null);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const closeMoreTools = useCallback(() => setMoreToolsOpen(false), []);
  const closeCreativeTools = useCallback(() => {
    setCreativeToolsOpen(false);
    moreToolsRoot.current?.focus({ preventScroll: true });
  }, []);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const [cmykOpen, setCmykOpen] = useState(false);
  const [softProofOpen, setSoftProofOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openRecharge = useCallback(() => {
    setAccountOpen(false);
    setSettingsOpen(false);
    if (cloudAccount.getSnapshot().authenticated) setBillingOpen(true);
    else setLoginOpen(true);
  }, []);
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
    window.addEventListener("draivio:cloud-recharge", openRecharge);
    return () => {
      window.removeEventListener("draivio:service-settings", open);
      window.removeEventListener("draivio:cloud-login", login);
      window.removeEventListener("draivio:cloud-recharge", openRecharge);
    };
  }, [openRecharge]);
  const toggleAccount = () => { setMoreToolsOpen(false); setAccountOpen((open) => !open) };
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
  useEffect(() => {
    const onCommand = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (executeEditorCommand(id, state, dispatch)) return
      if (id === 'export') {
        if (state.colorModel === 'cmyk') setCmykOpen(true)
        else if (!document.querySelector('.canvas-art')) dispatch({type:'set-notice',message:'没有可导出的画布'})
        else setExportOpen(true)
      }
      if (id === 'shortcuts') setShortcutsOpen(true)
      if (id === 'cmyk') setCmykOpen(true)
      if (id === 'proof') setSoftProofOpen(true)
      if (id === 'precision') setPrecisionOpen(true)
      if (id === 'creative') setCreativeToolsOpen(true)
      if (id === 'batch') setBatchOpen(true)
      if (id === 'artboards') setMoreToolsOpen(true)
      if (id === 'sources') setSettingsOpen(true)
    }
    const keyboard = (event: KeyboardEvent) => {
      if(document.querySelector('.result-stage') || event.defaultPrevented || event.isComposing || event.repeat || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if(isShortcutTextTarget(event.target) || isShortcutTextTarget(document.activeElement)) return
      const command = commands.find(c => ['export','shortcuts','size','canvasSize','cmyk','raw','proof','precision','creative','batch','artboards','sources'].includes(c.id) && matchesShortcut(event,c.id))
      if(command){event.preventDefault();runCommand(command.id)}
    }
    window.addEventListener(COMMAND_EVENT,onCommand)
    window.addEventListener('keydown',keyboard)
    return()=>{window.removeEventListener(COMMAND_EVENT,onCommand);window.removeEventListener('keydown',keyboard)}
  },[state,dispatch])
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
      {shortcutsOpen ? <ShortcutSettings onClose={()=>setShortcutsOpen(false)} /> : null}
      {creativeToolsOpen ? <CreativeTools onClose={closeCreativeTools} /> : null}
      <header
        className={`topbar app-titlebar${usesNativeMacControls ? " app-titlebar-macos" : ""}`}
        data-tauri-drag-region={isDesktopRuntime ? "deep" : undefined}
      >
        <div className="brand app-titlebar-brand">
          <span className="brand-mark app-titlebar-mark" aria-hidden="true" />
          <span className="app-titlebar-wordmark">Draivio</span>
          <span className="app-titlebar-name">AI 图片创作</span>
          <AppVersionLabel isDesktopRuntime={isDesktopRuntime} />
        </div>
        <div className="app-titlebar-content">
          <ApplicationMenu compact={compact} onCommand={runCommand} disabled={id => id === 'undo' ? !state.undoStack.length : id === 'redo' ? !state.redoStack.length : false} />
          <div className="quick-actions" ref={moreToolsRoot} tabIndex={-1} role="toolbar" aria-label="快捷操作">
            <ProjectFileControl compact />
            <button type="button" className="top-button quick-action-secondary" aria-label="撤销" title={`撤销 ${formatShortcut(shortcutFor('undo'))}`} disabled={!state.undoStack.length} onClick={()=>runCommand('undo')}>撤销</button>
            <button type="button" className="top-button quick-action-secondary" aria-label="重做" title={`重做 ${formatShortcut(shortcutFor('redo'))}`} disabled={!state.redoStack.length} onClick={()=>runCommand('redo')}>重做</button>
            <button type="button" className="top-button" title={`导出 ${formatShortcut(shortcutFor('export'))}`} onClick={()=>runCommand('export')}>导出</button>
          </div>
          <div hidden><RawControls /><DocumentSizeControl /></div>
          {moreToolsOpen ? <AnchoredWindow anchor={moreToolsRoot} title="画板管理" width={640} onClose={closeMoreTools} className="topbar-tools-panel"><div className="topbar-tools-content"><ArtboardControls /></div></AnchoredWindow> : null}
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
            <div className="account-wrap">
              <button
                ref={accountTrigger}
                className="avatar"
                title="账户与设置"
                aria-label="账户设置"
                aria-expanded={accountOpen}
                onClick={toggleAccount}
              >
                {account.user?.email.slice(0, 2).toUpperCase() || "登"}
              </button>
              {accountOpen ? (
                <AnchoredWindow
                  anchor={accountTrigger}
                  width={320}
                  dismissOnOutside
                  className="account-popover"
                  label="账户设置"
                  title="账户与设置"
                  onClose={closeAccount}
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
                      <AccountMenuIcon kind="login" />
                      <span className="account-menu-copy">
                        <span className="account-menu-title">登录 / 注册</span>
                        <span className="account-menu-description">
                          登录后，快速使用AI能力
                        </span>
                      </span>
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
                    onClick={openRecharge}
                  >
                    <AccountMenuIcon kind="billing" />
                    <span className="account-menu-copy">
                      <span className="account-menu-title">云服务充值</span>
                      <span className="account-menu-description">
                        查看实际余额与账户状态
                      </span>
                    </span>
                  </button>
                  <button className="account-menu-item" aria-label="软件设置" onClick={() => { setAccountOpen(false); setSoftwareSettingsOpen(true) }}>
                    <AccountMenuIcon kind="settings" />
                    <span className="account-menu-copy"><span className="account-menu-title">软件设置</span><span className="account-menu-description">存储、导入导出与快捷键</span></span>
                  </button>
                  {account.authenticated ? (
                    <>
                      <div className="account-menu-divider" />
                      <button
                        className="account-menu-item account-menu-item--logout"
                        aria-label="退出登录"
                        onClick={() => {
                          setAccountOpen(false);
                          void cloudAccount
                            .logout()
                            .catch(() =>
                              message.error(
                                "退出登录未能清理全部会话凭据，请重新打开账户设置确认登录状态",
                              ),
                            );
                        }}
                      >
                        <AccountMenuIcon kind="logout" />
                        <span className="account-menu-copy">
                          <span className="account-menu-title">退出登录</span>
                          <span className="account-menu-description">
                            退出本次云端会话
                          </span>
                        </span>
                      </button>
                    </>
                  ) : null}
                </AnchoredWindow>
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
      {softwareSettingsOpen ? <SoftwareSettings anchor={accountTrigger} onClose={closeSoftwareSettings}
        onOpenShortcuts={() => { closeSoftwareSettings(); setShortcutsOpen(true); }}
        onOpenServices={() => { closeSoftwareSettings(); setSettingsOpen(true); }} /> : null}
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

function AccountMenuIcon({ kind }: { kind: "sources" | "billing" | "login" | "logout" | "settings" }) {
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
      {kind === "settings" ? (
        <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="var(--ink-850)"/><circle cx="15" cy="17" r="2.5" fill="var(--ink-850)"/></>
      ) : kind === "sources" ? (
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
      ) : kind === "login" ? (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c.7-3.3 3.1-5 7-5s6.3 1.7 7 5" />
        </>
      ) : (
        <>
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h13" />
        </>
      )}
    </svg>
  );
}
