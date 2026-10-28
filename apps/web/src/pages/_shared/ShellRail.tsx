import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, FolderTree, Home, Inbox, Plus, Search, Settings2, SquarePen, FolderPlus, Folder } from "lucide-react";
import { ActivityIndicator } from "../../features/activity/ActivityIndicator";
import { useActivityRuntime } from "../../features/activity/activity-runtime-provider";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { OPEN_NOTESPACE_SETTINGS } from "../../features/settings/AppSettings";
import { FOCUS_TASK_COMPOSER_EVENT, OPEN_QUICK_CAPTURE_EVENT } from "../../shared/browser/shell-events";
import { cn } from "../../shared/ui";

type Page = "library" | "inbox" | "today";
type Props = {
  page: Page;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  explorerTriggerRef?: RefObject<HTMLButtonElement>;
  onCreate: (target: { kind: "category" | "workspace"; categoryId?: string }) => void;
  selectedCategoryId?: string;
};

const control = "relative grid !size-[34px] !min-h-[34px] shrink-0 place-items-center rounded-md border-0 p-0 text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent";
const active = "bg-tint text-accent";

export function ShellRail({ page, explorerOpen, onToggleExplorer, onCreate, selectedCategoryId, explorerTriggerRef }: Props) {
  const navigate = useNavigate();
  const activity = useActivityRuntime();
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!creating) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismissPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !openerRef.current?.contains(event.target as Node)) setCreating(false);
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setCreating(false); openerRef.current?.focus(); }
    };
    window.addEventListener("pointerdown", dismissPointer);
    window.addEventListener("keydown", dismissKey);
    return () => { window.removeEventListener("pointerdown", dismissPointer); window.removeEventListener("keydown", dismissKey); };
  }, [creating]);

  const openTaskComposer = () => {
    setCreating(false);
    const pathname = "/today";
    if (window.location.pathname === pathname && window.location.hash === "#new-task") {
      window.dispatchEvent(new Event(FOCUS_TASK_COMPOSER_EVENT));
      return;
    }
    void navigate({ to: pathname, hash: "new-task" });
  };

  const create = (kind: "category" | "workspace") => {
    setCreating(false);
    onCreate({ kind, categoryId: kind === "workspace" ? (selectedCategoryId || undefined) : undefined });
  };

  return (
    <nav className="relative z-40 flex h-full min-h-0 w-11 shrink-0 flex-col items-center border-r border-line bg-surface py-2" aria-label="Primary navigation">
      <Link to="/" className={cn(control, "!mb-4")} aria-label="Notespace home" title="Home">
        <img src="/brand/notespace-fox-head.svg" alt="" className="size-[27px]" />
      </Link>
      <div className="flex flex-col items-center gap-1" aria-label="Main pages">
        <Link to="/" className={cn(control, page === "library" && active)} aria-label="Library" title="Library" aria-current={page === "library" ? "page" : undefined}><Home size={17} /></Link>
        <Link to="/inbox" className={cn(control, page === "inbox" && active)} aria-label="Capture Queue" title="Capture Queue" aria-current={page === "inbox" ? "page" : undefined}><Inbox size={17} /></Link>
        <Link to="/today" className={cn(control, page === "today" && active)} aria-label="Today" title="Today" aria-current={page === "today" ? "page" : undefined}><CalendarCheck2 size={17} /></Link>
        <span className="my-1 h-px w-5 bg-line" aria-hidden="true" />
        <button ref={explorerTriggerRef} type="button" className={cn(control, explorerOpen && "text-accent")} aria-label="Toggle category explorer" title="Toggle Explorer" aria-expanded={explorerOpen} onClick={onToggleExplorer}><FolderTree size={17} /></button>
        <button type="button" className={control} aria-label="Quick Open" title="Quick Open (Ctrl/⌘ K)" onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}><Search size={17} /></button>
        <div className="relative">
          <button ref={openerRef} type="button" className={cn(control, creating && active)} aria-label="Create" aria-expanded={creating} aria-haspopup="menu" title="Create" onClick={() => setCreating(v => !v)}><Plus size={18} /></button>
          {creating && (
            <div ref={menuRef} role="menu" aria-label="Create" onKeyDown={(event) => {
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                items[(current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
              } else if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
              else if (event.key === "End") { event.preventDefault(); items[items.length - 1]?.focus(); }
            }} className="absolute top-0 left-[calc(100%+9px)] z-50 w-52 rounded-lg border border-line bg-surface p-1.5 shadow-[var(--shadow-popup)]">
              <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-ink hover:bg-tint" onClick={() => create("workspace")}><Folder size={15}/> Workspace</button>
              <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-ink hover:bg-tint" onClick={() => create("category")}><FolderPlus size={15}/> Category</button>
              <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-ink hover:bg-tint" onClick={() => {setCreating(false);window.dispatchEvent(new Event(OPEN_QUICK_CAPTURE_EVENT));}}><SquarePen size={15}/> Quick capture</button>
              
              <button type="button" role="menuitem" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-ink hover:bg-tint" onClick={() => openTaskComposer()}><CalendarCheck2 size={15}/> Task in Today</button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-auto flex flex-col items-center gap-1">
        <ActivityIndicator rail activity={activity} workspaceTitle="Activity" />
        <button type="button" className={control} aria-label="Settings" title="Settings" onClick={() => window.dispatchEvent(new Event(OPEN_NOTESPACE_SETTINGS))}><Settings2 size={17}/></button>
      </div>
    </nav>
  );
}
