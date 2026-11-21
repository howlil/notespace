import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isDesktopUpdaterEnabled } from "../../adapters/desktop/desktop-updater";
import { REQUEST_DESKTOP_UPDATE_CHECK } from "../../shared/browser/desktop-update-events";
import { DatabaseBackup, Monitor, Moon, Settings2, SlidersHorizontal, Sun, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
} from "../../shared/ui";
import { useTheme } from "../../shared/ui/theme/theme-provider";
import {
  THEME_MODES,
  THEME_PALETTES,
  themeModeLabel,
  type ThemeMode,
} from "../../shared/ui/theme/theme-model";
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
  const { mode, resolvedTheme, palette, setMode, setPalette } = useTheme();
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
    : <section className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3" aria-label="Device recovery">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-tint text-muted" aria-hidden="true"><Monitor size={15} /></span>
        <div className="min-w-0">
          <h3 className="m-0 text-xs font-medium text-ink">Device recovery</h3>
          <p className="mt-0.5 mb-0 text-[11px] leading-4 text-muted">Device recovery snapshots are available in the Windows desktop app.</p>
        </div>
      </section>;

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
                    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div>
                        <p id="notespace-theme-label" className="font-medium text-ink">Theme</p>
                        <p id="notespace-theme-value" className="mt-0.5 text-muted">{themeModeLabel(mode, resolvedTheme)}</p>
                      </div>
                      <div
                        role="radiogroup"
                        aria-labelledby="notespace-theme-label"
                        aria-describedby="notespace-theme-value"
                        className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-background p-0.5"
                      >
                        {THEME_MODES.map((option) => {
                          const active = mode === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              data-theme-mode={option}
                              onClick={() => setMode(option)}
                              className={`inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-[color,background-color,transform] duration-100 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                                active
                                  ? "bg-surface text-accent shadow-xs ring-1 ring-line"
                                  : "text-muted hover:bg-tint hover:text-ink"
                              }`}
                            >
                              <ThemeModeIcon mode={option} />
                              <span className="capitalize">{option}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p id="notespace-palette-label" className="font-medium text-ink">Color theme</p>
                        <p id="notespace-palette-value" className="text-[11px] text-muted">
                          {THEME_PALETTES.find((item) => item.id === palette)?.description}
                        </p>
                      </div>
                      <div
                        role="radiogroup"
                        aria-labelledby="notespace-palette-label"
                        aria-describedby="notespace-palette-value"
                        className="mt-2 grid grid-cols-5 gap-1.5 max-[520px]:grid-cols-2"
                      >
                        {THEME_PALETTES.map((option) => {
                          const active = palette === option.id;
                          const swatch = option.preview[resolvedTheme];
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              data-theme-palette={option.id}
                              title={option.description}
                              onClick={() => setPalette(option.id)}
                              className={`group flex flex-col items-start gap-1.5 rounded-lg border p-1.5 text-left transition-[color,background-color,border-color,transform] duration-100 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                                active
                                  ? "border-accent bg-tint text-accent ring-1 ring-accent/20"
                                  : "border-line bg-surface text-ink hover:border-accent/40 hover:bg-tint/60"
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className="relative flex h-9 w-full items-end justify-between overflow-hidden rounded-md border border-line/80 p-1.5"
                                style={{ backgroundColor: swatch.canvas }}
                              >
                                <span
                                  className="flex h-6 w-3/4 flex-col justify-center gap-1 rounded-[4px] border px-1.5"
                                  style={{ backgroundColor: swatch.surface, borderColor: swatch.bg }}
                                >
                                  <span className="block h-1 w-4/5 rounded-full" style={{ backgroundColor: swatch.ink, opacity: 0.78 }} />
                                  <span className="block h-1 w-1/2 rounded-full" style={{ backgroundColor: swatch.ink, opacity: 0.34 }} />
                                </span>
                                <span
                                  className="size-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: swatch.accent }}
                                />
                              </span>
                              <span className="px-0.5 text-[11px] font-medium leading-none">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="font-medium text-ink">Library storage</p>
                        <p className="mt-0.5 text-muted">{native ? "Saved on this device" : "Saved in this browser"}</p>
                      </div>
                      <span className="text-[11px] text-muted">Local</span>
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

function ThemeModeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "system") return <Monitor size={13} aria-hidden="true" />;
  if (mode === "dark") return <Moon size={13} aria-hidden="true" />;
  return <Sun size={13} aria-hidden="true" />;
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
      className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-left text-[12px] font-medium transition-[color,background-color,transform] duration-100 active:scale-[0.985] disabled:opacity-50 ${active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}
