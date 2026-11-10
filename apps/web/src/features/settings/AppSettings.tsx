import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isDesktopUpdaterEnabled } from "../../adapters/desktop/desktop-updater";
import { REQUEST_DESKTOP_UPDATE_CHECK } from "../../shared/browser/desktop-update-events";
import { DatabaseBackup, Moon, Settings2, SlidersHorizontal, Sun, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
} from "../../shared/ui";
import { useTheme } from "../../shared/ui/theme/theme-provider";
import { isTauriRuntime } from "../../adapters/desktop/desktop-lifecycle";

export const OPEN_NOTESPACE_SETTINGS = "notespace:open-settings";
type SettingsTab = "general" | "data";

export function SettingsTrigger({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  if (showLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        aria-label="Open Notespace settings"
        onClick={() => window.dispatchEvent(new Event(OPEN_NOTESPACE_SETTINGS))}
      >
        <Settings2 size={15} aria-hidden="true" />
        Settings
      </Button>
    );
  }
  return (
    <IconButton
      type="button"
      className={className}
      aria-label="Open Notespace settings"
      title="Settings"
      onClick={() => window.dispatchEvent(new Event(OPEN_NOTESPACE_SETTINGS))}
    >
      <Settings2 size={17} aria-hidden="true" />
    </IconButton>
  );
}

export function AppSettings({ renderLibraryTools, renderDesktopRecovery }: {
  renderLibraryTools: (onBusyChange: (busy: boolean) => void, disabled: boolean, deviceRecovery: ReactNode) => ReactNode;
  renderDesktopRecovery: (onBusyChange: (busy: boolean) => void) => ReactNode;
}) {
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [native, setNative] = useState(false);
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const nativeRuntime = isTauriRuntime();
    setNative(nativeRuntime);
    if (nativeRuntime) {
      void isDesktopUpdaterEnabled()
        .then(setUpdaterEnabled)
        .catch(() => setUpdaterEnabled(false));
    }
    const onOpen = () => { setTab("general"); setOpen(true); };
    const onOpenData = () => { setTab("data"); setOpen(true); };
    window.addEventListener(OPEN_NOTESPACE_SETTINGS, onOpen);
    window.addEventListener("notespace:open-settings-data", onOpenData);
    return () => {
      window.removeEventListener(OPEN_NOTESPACE_SETTINGS, onOpen);
      window.removeEventListener("notespace:open-settings-data", onOpenData);
    };
  }, []);

  const onBusyChange = useCallback((value: boolean) => {
    busyRef.current = value;
    setBackupBusy(value);
  }, []);

  function onChangeOpen(next: boolean) {
    if (!next && busyRef.current) return;
    setOpen(next);
  }

  const deviceRecovery = native
    ? <fieldset disabled={backupBusy} className="min-w-0 border-0 p-0">{renderDesktopRecovery(onBusyChange)}</fieldset>
    : <section className="py-2" aria-label="Device recovery"><p className="m-0 text-[10px] leading-4 text-muted">Device recovery snapshots are available in the Windows desktop app.</p></section>;

  return (
    <Dialog open={open} onOpenChange={onChangeOpen}>
      <DialogContent
        className="w-[min(94vw,640px)] p-0 max-[480px]:p-0"
        data-notespace-settings-root
        aria-label="Notespace settings"
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busyRef.current) event.preventDefault(); }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
          <div>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Preferences and data</DialogDescription>
          </div>
          <IconButton
            type="button"
            aria-label="Close settings"
            title="Close settings"
            disabled={backupBusy}
            onClick={() => onChangeOpen(false)}
          >
            <X size={16} />
          </IconButton>
        </header>

        <div className="grid min-h-0 grid-cols-[132px_minmax(0,1fr)] max-[560px]:grid-cols-1">
          <div className="flex flex-col gap-1 border-r border-line p-1.5 max-[560px]:flex-row max-[560px]:border-r-0 max-[560px]:border-b">
            <SettingsTabButton
              active={tab === "general"}
              disabled={backupBusy}
              icon={<SlidersHorizontal size={15} aria-hidden="true" />}
              onClick={() => setTab("general")}
            >
              General
            </SettingsTabButton>
            <SettingsTabButton
              active={tab === "data"}
              disabled={backupBusy}
              icon={<DatabaseBackup size={15} aria-hidden="true" />}
              onClick={() => setTab("data")}
            >
              Data &amp; backup
            </SettingsTabButton>
          </div>

          <div className="min-w-0 max-h-[min(72dvh,520px)] overflow-y-auto p-3 text-xs max-[560px]:p-2.5">
            <AnimatePresence initial={false} mode="wait">
              {tab === "general" ? (
                <motion.section
                  key="general"
                  aria-label="General settings"
                  className="space-y-2.5"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <div>
                    <h3 className="text-sm font-medium text-ink">Appearance</h3>
                    <p className="mt-1 text-muted">Change the look of Notespace.</p>
                  </div>
                  <div className="divide-y divide-line border-y border-line">
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p id="notespace-theme-label" className="font-medium text-ink">Theme</p>
                        <p id="notespace-theme-value" className="mt-0.5 text-muted">{dark ? "Dark mode" : "Light mode"}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={dark}
                        aria-labelledby="notespace-theme-label"
                        aria-describedby="notespace-theme-value"
                        onClick={toggle}
                        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-[background-color,transform] duration-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${dark ? "bg-accent" : "bg-line/70 hover:bg-line"}`}
                        data-state={dark ? "checked" : "unchecked"}
                      >
                        <span className={`grid size-6 place-items-center rounded-full bg-surface text-accent shadow-sm transition-transform duration-100 ${dark ? "translate-x-5" : "translate-x-0"}`}>
                          {dark ? <Moon size={13} aria-hidden="true" /> : <Sun size={13} aria-hidden="true" />}
                        </span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="font-medium text-ink">Library storage</p>
                        <p className="mt-0.5 text-muted">{native ? "Saved on this device" : "Saved in this browser"}</p>
                      </div>
                      <span className="text-[10px] text-muted">Local</span>
                    </div>
                  </div>
                  {updaterEnabled && (
                    <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                      <div>
                        <p className="font-medium text-ink">Desktop updates</p>
                        <p className="mt-0.5 text-muted">Check for signed updates.</p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => {
                        onChangeOpen(false);
                        window.dispatchEvent(new Event(REQUEST_DESKTOP_UPDATE_CHECK));
                      }}>Check for updates</Button>
                    </div>
                  )}
                </motion.section>
              ) : (
                <motion.section
                  key="data"
                  aria-label="Data and backup settings"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <h3 className="text-sm font-medium text-ink">Data &amp; backup</h3>
                  <p className="mt-1 leading-4 text-muted">Export or restore your library, recover this device, or bring back deleted Workspaces.</p>
                  {renderLibraryTools(onBusyChange, backupBusy, deviceRecovery)}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTabButton({
  active,
  disabled,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-left text-[11px] font-medium transition-[color,background-color,transform] duration-100 active:scale-[0.985] disabled:opacity-50 ${active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}
