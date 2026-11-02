import { useState, type ReactNode } from "react";
import { PanelLeft, Search } from "lucide-react";
import { NotespaceLogo } from "../../shared/ui/NotespaceLogo";
import { HeaderPlacement, useDesktopChrome } from "../../shared/ui/desktop-titlebar/HeaderPlacement";
import { SettingsTrigger } from "../../features/settings/AppSettings";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { IconButton } from "../../shared/ui";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  canvas?: boolean;
  headerActions?: ReactNode;
  dashboard?: boolean;
  page?: "library" | "inbox" | "today";
  selectedCategoryId?: string;
};

/** One shell shared by Welcome and Canvas. Routes still own authored content. */
export function LibraryPageShell({ sidebar, children, canvas = false, headerActions }: Props) {
  const [explorerOpen, setExplorerOpen] = useState(true);
  const { customChromeActive } = useDesktopChrome();
  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-background" data-notespace-single-shell>
      <HeaderPlacement className="relative z-30 flex min-h-[38px] shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        {!customChromeActive && <NotespaceLogo size="sm" showWordmark={false} />}
        <IconButton className="!size-7" aria-label={explorerOpen ? "Hide Explorer" : "Show Explorer"}
          title={explorerOpen ? "Hide Explorer" : "Show Explorer"} aria-expanded={explorerOpen}
          onClick={() => setExplorerOpen((value) => !value)}>
          <PanelLeft size={16} />
        </IconButton>
        <div className="min-w-0 flex-1" data-tauri-drag-region />
        <IconButton className="!size-7" aria-label="Search Notespace" title="Search · Ctrl/⌘ K"
          onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}>
          <Search size={15} />
        </IconButton>
        <SettingsTrigger className="!size-7" />
        {headerActions}
      </HeaderPlacement>
      <div className="flex min-h-0 min-w-0 flex-1">
        {explorerOpen && (
          <div id="notespace-home-sidebar" className="h-full min-h-0 w-[228px] shrink-0 overflow-hidden border-r border-line bg-sidebar max-[560px]:w-[200px]">
            {sidebar}
          </div>
        )}
        <main className={canvas
          ? "relative min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
          : "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background"}>
          {children}
        </main>
      </div>
    </div>
  );
}
