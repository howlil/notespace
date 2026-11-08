import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { NotespaceLogo } from "../../shared/ui/brand/NotespaceLogo";
import { HeaderPlacement, useDesktopChrome } from "../../features/desktop";
import { SettingsTrigger } from "../../features/settings";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search";
import { useLibraryExplorer } from "../../features/library";
import { IconButton } from "../../shared/ui";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  canvas?: boolean;
  workspaceTitle?: string;
  headerActions?: ReactNode;
};

/** One shell shared by Welcome and Canvas. Routes still own authored content. */
export function LibraryPageShell({ sidebar, children, canvas = false, workspaceTitle, headerActions }: Props) {
  const { customChromeActive } = useDesktopChrome();
  const { preference, setPreference } = useLibraryExplorer();
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const explorerOpen = preference === "open" || (preference === "auto" && !narrow);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-background" data-notespace-single-shell>
      <HeaderPlacement className="relative z-30 flex min-h-[38px] shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        {!customChromeActive && <IconButton
          type="button"
          variant="ghost"
          className="!size-7 shrink-0 px-0 text-ink/70 hover:bg-tint hover:text-accent"
          aria-label={explorerOpen ? "Hide Explorer" : "Show Explorer"}
          title={explorerOpen ? "Hide Explorer" : "Show Explorer"}
          aria-expanded={explorerOpen}
          aria-controls={explorerOpen ? "notespace-home-sidebar" : undefined}
          onClick={() => setPreference(explorerOpen ? "closed" : "open")}
        ><NotespaceLogo size="sm" showWordmark={false} /></IconButton>}
        {workspaceTitle && <div role="group" aria-label="Current workspace"
          className="min-w-0 max-w-[min(228px,calc((100vw_-_510px)/2))] truncate border-l border-line pl-2 text-[11px] font-medium text-ink max-[760px]:max-w-[calc(58vw_-_72px)]"
          title={workspaceTitle}>
          {workspaceTitle}
        </div>}
        <div className="min-w-0 flex-1" data-tauri-drag-region />
        <button
          type="button"
          className={"pointer-events-auto absolute left-1/2 top-1/2 flex h-7 w-[min(390px,calc(100vw-136px))] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-line bg-background px-2.5 text-left text-[11px] text-muted transition-colors hover:border-accent/35 hover:bg-tint/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 " +
            (workspaceTitle ? "max-[760px]:left-auto max-[760px]:right-3 max-[760px]:w-[42vw] max-[760px]:translate-x-0" : "max-[560px]:w-[calc(100vw-120px)]")}
          aria-label="Search Notespace"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          title="Search · Ctrl/⌘ K"
          onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}
        >
          <Search size={14} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Search Notespace</span>
          <kbd className="ml-auto shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] text-muted max-[560px]:hidden">Ctrl/⌘ K</kbd>
        </button>
        {headerActions}
      </HeaderPlacement>
      <div className="flex min-h-0 min-w-0 flex-1">
        {explorerOpen && <div id="notespace-home-sidebar" data-notespace-library-explorer="open" className="h-full min-h-0 w-[228px] shrink-0 overflow-hidden border-r border-line bg-sidebar max-[560px]:w-[200px]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">{sidebar}</div>
            <div className="flex shrink-0 flex-col gap-1 border-t border-line px-2 py-2">
              <SettingsTrigger
                showLabel
                className="w-full justify-start gap-2 rounded-md border-0 px-2.5 py-2 text-left text-[11px] text-ink hover:bg-tint hover:text-accent"
              />
            </div>
          </div>
        </div>}
        <main className={canvas
          ? "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
          : "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background"}>
          {children}
        </main>
      </div>
    </div>
  );
}
