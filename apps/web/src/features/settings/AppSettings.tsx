import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link } from "@tanstack/react-router";
import { REQUEST_DESKTOP_UPDATE_CHECK } from "../../shared/browser/desktop-update-events";
import { DatabaseBackup, Settings2, SlidersHorizontal, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
} from "../../shared/ui";
import { useTheme } from "../../shared/ui/theme-provider";
import { isTauriRuntime } from "../../adapters/browser/desktop-lifecycle";

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
  renderLibraryTools: (onBusyChange: (busy: boolean) => void, disabled: boolean) => ReactNode;
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
      void invoke<boolean>("desktop_updater_enabled")
        .then(setUpdaterEnabled)
        .catch(() => setUpdaterEnabled(false));
    }
    const onOpen = () => {
      setTab("general");
      setOpen(true);
    };
    window.addEventListener(OPEN_NOTESPACE_SETTINGS, onOpen);
    return () => window.removeEventListener(OPEN_NOTESPACE_SETTINGS, onOpen);
  }, []);

  const onBusyChange = useCallback((value: boolean) => {
    busyRef.current = value;
    setBackupBusy(value);
  }, []);

  function onChangeOpen(next: boolean) {
    if (!next && busyRef.current) return;
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onChangeOpen}>
      <DialogContent
        className="w-[min(94vw,740px)] p-0 max-[480px]:p-0"
        data-notespace-settings-root
        aria-label="Notespace settings"
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busyRef.current) event.preventDefault(); }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>App preferences, your data, and recovery.</DialogDescription>
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

        <div className="grid min-h-[300px] grid-cols-[170px_minmax(0,1fr)] max-[560px]:grid-cols-1">
          <div className="flex flex-col gap-1 border-r border-line p-3 max-[560px]:flex-row max-[560px]:border-r-0 max-[560px]:border-b">
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

          <div className="min-w-0 max-h-[min(70dvh,560px)] overflow-y-auto p-5 text-xs max-[560px]:p-4">
            {tab === "general" ? (
              <section aria-label="General settings">
                <h3 className="text-sm font-medium text-ink">Appearance</h3>
                <p className="mt-1 text-muted">Choose how Notespace looks on this device.</p>
                <div className="mt-4 flex items-center justify-between gap-3 border-y border-line py-3">
                  <div>
                    <p className="font-medium text-ink">Theme</p>
                    <p className="mt-1 text-muted">{dark ? "Dark mode" : "Light mode"}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={toggle}>
                    Use {dark ? "light" : "dark"} theme
                  </Button>
                </div>
                <p className="mt-4 text-muted">
                  {native ? "Desktop library data is stored on this device." : "Notespace is running in your browser."}
                </p>
                {updaterEnabled && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                    <div>
                      <p className="font-medium text-ink">Desktop updates</p>
                      <p className="mt-1 text-muted">Check for signed Notespace updates.</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => {
                      onChangeOpen(false);
                      window.dispatchEvent(new Event(REQUEST_DESKTOP_UPDATE_CHECK));
                    }}>Check for updates</Button>
                  </div>
                )}
              </section>
            ) : (
              <section aria-label="Data and backup settings">
                <h3 className="text-sm font-medium text-ink">Data &amp; backup</h3>
                <p className="mt-1 leading-5 text-muted">
                  Download a portable ZIP copy of your library. On desktop you can also create
                  a verified SQLite snapshot without interrupting your workspace.
                </p>
                {renderLibraryTools(onBusyChange, backupBusy)}
                {native ? (
                  <fieldset disabled={backupBusy} className="min-w-0 border-0 p-0">
                    {renderDesktopRecovery(onBusyChange)}
                  </fieldset>
                ) : (
                  <p className="mt-4 text-muted">
                    Verified SQLite snapshots are available in the Windows desktop app.
                  </p>
                )}
                <p className="mt-4 text-muted">
                  Restoring a portable library backup replaces its current content.
                  Desktop SQLite recovery uses an offline procedure and never replaces the live database automatically.
                </p>
                <section aria-label="Historical recovery" className="mt-5 border-t border-line pt-4">
                  <h4 className="text-xs font-medium text-ink">Historical recovery</h4>
                  <p className="mt-1 leading-5 text-muted">
                    Review pending Captures, unassigned Tasks, and scheduled Tasks from older Notespace versions.
                    New work belongs in a Workspace.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/inbox"
                      aria-disabled={backupBusy}
                      tabIndex={backupBusy ? -1 : undefined}
                      onClick={(event) => {
                        if (busyRef.current) { event.preventDefault(); return; }
                        onChangeOpen(false);
                      }}
                      className="inline-flex min-h-8 items-center rounded-md border border-line px-3 text-[11px] font-medium text-ink hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                    >
                      Recover Captures and unassigned Tasks
                    </Link>
                    <Link
                      to="/today"
                      aria-disabled={backupBusy}
                      tabIndex={backupBusy ? -1 : undefined}
                      onClick={(event) => {
                        if (busyRef.current) { event.preventDefault(); return; }
                        onChangeOpen(false);
                      }}
                      className="inline-flex min-h-8 items-center rounded-md border border-line px-3 text-[11px] font-medium text-ink hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                    >
                      Review scheduled Tasks
                    </Link>
                  </div>
                </section>
              </section>
            )}
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
      className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-left text-[11px] font-medium transition-colors disabled:opacity-50 ${active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}
