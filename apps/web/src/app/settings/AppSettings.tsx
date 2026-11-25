import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isDesktopUpdaterEnabled } from "../../platform/desktop/desktop-updater";
import { requestDesktopUpdateCheck } from "../../platform/desktop";
import { DatabaseBackup, Monitor, Settings2, SlidersHorizontal } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  IconButton,
  SettingRow,
} from "../../shared/ui";
import { useStore } from "../../shared/lib/use-store";
import { useTheme } from "../../shared/ui/theme/theme-provider";
import { THEME_PALETTES } from "../../shared/ui/theme/theme-model";
import { isTauriRuntime } from "../../platform/runtime/durability-barrier";
import {
  appShellStore,
  openAppSettings,
  setAppSettingsOpen,
  setAppSettingsTab,
} from "../shell/app-shell-store";

export function SettingsTrigger({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  if (showLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        aria-label="Open Notespace settings"
        onClick={() => openAppSettings("general")}
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
      onClick={() => openAppSettings("general")}
    >
      <Settings2 size={17} aria-hidden="true" />
    </IconButton>
  );
}

export function AppSettings({ renderLibraryTools, renderDesktopRecovery }: {
  renderLibraryTools: (onBusyChange: (busy: boolean) => void, disabled: boolean, deviceRecovery: ReactNode) => ReactNode;
  renderDesktopRecovery: (onBusyChange: (busy: boolean) => void) => ReactNode;
}) {
  const { palette, setPalette } = useTheme();
  const open = useStore(appShellStore, (state) => state.settingsOpen);
  const tab = useStore(appShellStore, (state) => state.settingsTab);
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
  }, []);

  const onBusyChange = useCallback((value: boolean) => {
    busyRef.current = value;
    setBackupBusy(value);
  }, []);

  function onChangeOpen(next: boolean) {
    if (!next && busyRef.current) return;
    setAppSettingsOpen(next);
  }

  const deviceRecovery = native
    ? <fieldset disabled={backupBusy} className="min-w-0 border-0 p-0">{renderDesktopRecovery(onBusyChange)}</fieldset>
    : (
      <section aria-label="Device recovery" className="pt-3">
        <SettingRow
          title="Device recovery"
          description="SQLite snapshots are available in the Windows desktop app."
          control={(
            <Badge variant="subtle" className="h-6 rounded-md px-2 text-xs">
              <Monitor size={11} aria-hidden="true" />
              Desktop
            </Badge>
          )}
        />
      </section>
    );

  return (
    <Dialog open={open} onOpenChange={onChangeOpen}>
      <DialogContent
        size="lg"
        padded={false}
        className="rounded-lg"
        data-notespace-settings-root
        aria-label="Notespace settings"
        onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busyRef.current) event.preventDefault(); }}
      >
        <DialogHeader
          title="Settings"
          closeLabel="Close settings"
          closeDisabled={backupBusy}
          onClose={() => onChangeOpen(false)}
          className="h-9 min-h-0 px-3.5 py-0"
        />
        <DialogDescription className="sr-only">Preferences and data</DialogDescription>

        <div className="grid min-h-0 grid-cols-[140px_minmax(0,1fr)] max-[520px]:grid-cols-1">
          <div className="flex flex-col gap-0.5 border-r border-line bg-sidebar/50 p-1.5 max-[520px]:flex-row max-[520px]:border-r-0 max-[520px]:border-b">
            <SettingsTabButton
              active={tab === "general"}
              disabled={backupBusy}
              icon={<SlidersHorizontal size={13} aria-hidden="true" />}
              onClick={() => setAppSettingsTab("general")}
            >
              General
            </SettingsTabButton>
            <SettingsTabButton
              active={tab === "data"}
              disabled={backupBusy}
              icon={<DatabaseBackup size={13} aria-hidden="true" />}
              onClick={() => setAppSettingsTab("data")}
            >
              Data &amp; backup
            </SettingsTabButton>
          </div>

          <div className="min-w-0 max-h-[min(70dvh,460px)] overflow-y-auto px-4 py-3 text-sm no-scrollbar max-[520px]:p-3">
            <AnimatePresence initial={false} mode="wait">
              {tab === "general" ? (
                <motion.section
                  key="general"
                  aria-label="General settings"
                  className="divide-y divide-line"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                >
                  <div className="pb-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p id="notespace-palette-label" className="text-[12px] font-medium text-ink">Color theme</p>
                      <p id="notespace-palette-value" className="truncate text-[11px] text-muted">
                        {THEME_PALETTES.find((item) => item.id === palette)?.description}
                      </p>
                    </div>
                    <div
                      role="radiogroup"
                      aria-labelledby="notespace-palette-label"
                      aria-describedby="notespace-palette-value"
                      className="mt-2 grid grid-cols-5 gap-1 max-[520px]:grid-cols-3"
                    >
                      {THEME_PALETTES.map((option) => {
                        const active = palette === option.id;
                        const swatch = option.preview.light;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            data-theme-palette={option.id}
                            title={option.description}
                            onClick={() => setPalette(option.id)}
                            className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-left transition-[color,background-color,border-color,transform] duration-100 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                              active
                                ? "border-accent bg-tint text-accent"
                                : "border-line bg-surface text-ink hover:border-accent/40 hover:bg-tint/60"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="relative size-3.5 shrink-0 overflow-hidden rounded-[4px] border border-line"
                              style={{ backgroundColor: swatch.canvas }}
                            >
                              <span
                                className="absolute inset-y-0 right-0 w-1.5"
                                style={{ backgroundColor: swatch.accent }}
                              />
                            </span>
                            <span className="truncate text-[11px] font-medium leading-none">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <SettingRow
                    className="py-2.5"
                    title="Library storage"
                    description={native ? "Saved on this device" : "Saved in this browser"}
                    control={<Badge variant="neutral" className="rounded px-1.5 py-0.5 text-xs font-normal">Local</Badge>}
                  />
                  {updaterEnabled && (
                    <SettingRow
                      className="py-2.5"
                      title="Desktop updates"
                      description="Check for signed updates."
                      control={(
                        <Button variant="secondary" size="sm" onClick={() => {
                          onChangeOpen(false);
                          requestDesktopUpdateCheck();
                        }}>Check for updates</Button>
                      )}
                    />
                  )}
                </motion.section>
              ) : (
                <motion.section
                  key="data"
                  aria-label="Data and backup settings"
                  className="space-y-3"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                >
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
      className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-left text-[12px] font-medium transition-[color,background-color,transform] duration-100 active:scale-[0.985] disabled:opacity-50 ${active ? "bg-tint text-accent" : "text-muted hover:bg-tint/70 hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}
