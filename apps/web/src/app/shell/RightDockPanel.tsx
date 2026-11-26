import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, ChevronDown, ChevronRight, Info, LayoutGrid, Link2, ListTree, PanelRightClose } from "lucide-react";
import type { Workspace } from "../../entities/workspace";
import { getNote, type Note } from "../../platform/api/note-api";
import {
  DockedCardLibraryView,
  DockedSideCardsView,
  NoteInfoContent,
  extractMarkdownHeadings,
} from "../../modules/note-editor";
import { useStore } from "../../shared/lib/use-store";
import { useDesktopChrome } from "../../platform/desktop";
import { IconButton, SegmentedControl, cn } from "../../shared/ui";
import {
  activeWorkspaceStore,
  requestFocusElementOnActiveCanvas,
  requestFocusNoteOnActiveCanvas,
  requestPlaceNoteOnActiveCanvas,
} from "./active-workspace-store";
import {
  clampRightDockWidth,
  closeRightDock,
  closeSideCard,
  openNoteInSideCards,
  openRightDockMode,
  rightDockStore,
  setActiveSideCard,
  setDockHighlightBlockId,
  setLibraryDetailNoteId,
  setRightDockWidth,
  setSideCardsLayout,
  toggleRightDockMode,
  type RightDockMode,
} from "./right-dock-store";

type Props = {
  activeWorkspace?: Workspace;
};

type OutlineScope = "workspace" | "note";

const RAIL_ITEMS: ReadonlyArray<{
  mode: RightDockMode;
  label: string;
  shortcut: string;
  icon: typeof LayoutGrid;
}> = [
  { mode: "library", label: "Card Library", shortcut: "⌘1", icon: LayoutGrid },
  { mode: "sidecards", label: "Side Cards", shortcut: "⌘2", icon: BookOpen },
  { mode: "info", label: "Info & Backlinks", shortcut: "⌘3", icon: Info },
  { mode: "outline", label: "Outline", shortcut: "⌘4", icon: ListTree },
];

function ownsTextInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .cm-editor'));
}

function hasForegroundModal() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]'))
    .some((el) => el.getClientRects().length > 0);
}

function DockedOutlineView({
  activeWorkspace,
  selectedNoteId,
  onSelectHeading,
}: {
  activeWorkspace?: Workspace;
  selectedNoteId: string | null;
  onSelectHeading: (noteId: string, blockId?: string) => void;
}) {
  const outlineTree = useStore(activeWorkspaceStore, (s) => s.outlineTree);
  const [scope, setScope] = useState<OutlineScope>(activeWorkspace ? "workspace" : "note");
  const [note, setNote] = useState<Note | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copiedSectionId, setCopiedSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspace && scope === "workspace") setScope("note");
  }, [activeWorkspace, scope]);

  useEffect(() => {
    if (!selectedNoteId) {
      setNote(null);
      return undefined;
    }
    let mounted = true;
    void getNote(selectedNoteId)
      .then((loaded) => { if (mounted) setNote(loaded); })
      .catch(() => { if (mounted) setNote(null); });
    return () => { mounted = false; };
  }, [selectedNoteId]);

  const headings = note ? extractMarkdownHeadings(note.document) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line/70 bg-surface px-3">
        <h2 className="m-0 text-[13px] font-semibold text-ink">Outline</h2>
        <SegmentedControl
          aria-label="Outline scope"
          variant="tabs"
          options={activeWorkspace
            ? [{ value: "workspace" as const, label: "Workspace" }, { value: "note" as const, label: "Headings" }]
            : [{ value: "note" as const, label: "Headings" }]}
          value={scope}
          onChange={setScope}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
        {scope === "workspace" && activeWorkspace ? (
          outlineTree.sections.length === 0 && outlineTree.ungrouped.length === 0 ? (
            <p className="m-0 rounded-md border border-line bg-canvas px-3 py-4 text-center text-xs text-muted">
              No Sections, Note cards, or Shortcuts on this Canvas yet.
            </p>
          ) : (
            <div className="grid gap-2">
              {outlineTree.sections.map((section) => {
                const collapsed = Boolean(collapsedSections[section.elementId]);
                return (
                  <div key={section.elementId} className="rounded-md border border-line/70 bg-canvas/40 p-1">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-1 text-left text-[12px] font-semibold text-ink hover:bg-tint"
                        onClick={() => setCollapsedSections((prev) => ({ ...prev, [section.elementId]: !prev[section.elementId] }))}
                      >
                        {collapsed
                          ? <ChevronRight size={12} className="shrink-0 text-muted" aria-hidden="true" />
                          : <ChevronDown size={12} className="shrink-0 text-muted" aria-hidden="true" />}
                        <span className="truncate">{section.label}</span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-accent"
                        onClick={() => requestFocusElementOnActiveCanvas(section.elementId)}
                      >
                        Focus
                      </button>
                      <IconButton
                        type="button"
                        size="xs"
                        aria-label={`Copy link to ${section.label}`}
                        title={copiedSectionId === section.elementId ? "Copied!" : "Copy section link"}
                        onClick={() => {
                          const url = `${window.location.origin}/workspaces/${encodeURIComponent(activeWorkspace.id)}?sectionId=${encodeURIComponent(section.elementId)}`;
                          void navigator.clipboard?.writeText(url);
                          setCopiedSectionId(section.elementId);
                          window.setTimeout(() => setCopiedSectionId(null), 1500);
                        }}
                      >
                        <Link2 size={11} aria-hidden="true" />
                      </IconButton>
                    </div>
                    {!collapsed && section.children.length > 0 && (
                      <div className="mt-1 grid gap-0.5 pl-4">
                        {section.children.map((child) => (
                          <button
                            key={child.elementId}
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-tint",
                              child.noteId && child.noteId === selectedNoteId ? "bg-tint font-medium text-accent" : "text-ink",
                            )}
                            onClick={() => requestFocusElementOnActiveCanvas(child.elementId)}
                          >
                            <span className="truncate">{child.label}</span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">{child.kind}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {outlineTree.ungrouped.length > 0 && (
                <div className="grid gap-0.5">
                  {outlineTree.sections.length > 0 && (
                    <div className="px-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Ungrouped
                    </div>
                  )}
                  {outlineTree.ungrouped.map((item) => (
                    <button
                      key={item.elementId}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-tint",
                        item.noteId && item.noteId === selectedNoteId ? "bg-tint font-medium text-accent" : "text-ink",
                      )}
                      onClick={() => requestFocusElementOnActiveCanvas(item.elementId)}
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">{item.kind}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        ) : !selectedNoteId ? (
          <p className="m-0 rounded-md border border-line bg-canvas px-3 py-4 text-center text-xs text-muted">
            Select a Note to view its Markdown headings.
          </p>
        ) : headings.length === 0 ? (
          <p className="m-0 rounded-md border border-line bg-canvas px-3 py-4 text-center text-xs text-muted">
            No H1–H3 headings in this Note.
          </p>
        ) : (
          <div className="grid gap-0.5">
            {headings.map((h, idx) => (
              <button
                key={`${idx}-${h.text}`}
                type="button"
                className="w-full truncate rounded-md py-1.5 pr-2 text-left text-[12.5px] text-ink transition-colors hover:bg-tint"
                style={{ paddingLeft: `${8 + (h.depth - 1) * 12}px` }}
                onClick={() => onSelectHeading(selectedNoteId, h.blockId)}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RightDockPanel({ activeWorkspace }: Props) {
  const navigate = useNavigate();
  const dock = useStore(rightDockStore);
  const { customChromeActive, platform } = useDesktopChrome();
  const isWindowsCustom = customChromeActive && platform === "windows";
  const [narrow, setNarrow] = useState(false);
  const [resizingWidth, setResizingWidth] = useState<number | null>(null);
  const railRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const openCardPage = (noteId: string) => {
    void navigate({ to: "/cards/$noteId", params: { noteId } });
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || hasForegroundModal()) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !ownsTextInput(event.target)) {
        const keyMap: Record<string, RightDockMode> = {
          "1": "library",
          "2": "sidecards",
          "3": "info",
          "4": "outline",
        };
        const targetMode = keyMap[event.key];
        if (targetMode) {
          event.preventDefault();
          toggleRightDockMode(targetMode);
          return;
        }
      }
      if (event.key === "Escape" && dock.open && !ownsTextInput(event.target)) {
        event.preventDefault();
        closeRightDock();
        railRefs.current[dock.mode]?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dock.mode, dock.open]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (narrow) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = dock.width;
    const maxAllowed = Math.max(320, Math.min(540, window.innerWidth - 340));

    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.min(maxAllowed, clampRightDockWidth(startWidth + (startX - moveEvent.clientX)));
      setResizingWidth(next);
      setRightDockWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizingWidth(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handlePlaceNote = (noteId: string, options?: { clientPoint?: { x: number; y: number } }) => {
    requestPlaceNoteOnActiveCanvas(noteId, options);
  };

  const handleFocusNote = (noteId: string) => {
    requestFocusNoteOnActiveCanvas(noteId);
  };

  const renderDrawerContent = () => {
    if (dock.mode === "library") {
      return (
        <DockedCardLibraryView
          drawerWidth={dock.width}
          activeWorkspaceId={activeWorkspace?.id}
          selectedNoteId={dock.selectedNoteId}
          detailNoteId={dock.libraryDetailNoteId}
          onDetailNoteChange={setLibraryDetailNoteId}
          onOpenInSideCards={(noteId) => openNoteInSideCards(noteId, { focusDock: true })}
          onOpenCardPage={openCardPage}
          onPlaceNote={handlePlaceNote}
        />
      );
    }
    if (dock.mode === "sidecards") {
      return (
        <DockedSideCardsView
          sideCardIds={dock.sideCardIds}
          activeSideCardId={dock.activeSideCardId}
          layout={dock.sideCardsLayout}
          highlightBlockId={dock.highlightBlockId}
          activeWorkspaceId={activeWorkspace?.id}
          onLayoutChange={setSideCardsLayout}
          onSelectCard={setActiveSideCard}
          onCloseCard={closeSideCard}
          onOpenCardPage={openCardPage}
          onPlaceNote={activeWorkspace ? (noteId) => handlePlaceNote(noteId) : undefined}
          onFocusNote={activeWorkspace ? handleFocusNote : undefined}
        />
      );
    }
    if (dock.mode === "info") {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-line/70 bg-surface px-3">
            <h2 className="m-0 text-[13px] font-semibold text-ink">Info &amp; Backlinks</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
            <NoteInfoContent
              noteId={dock.selectedNoteId}
              active={dock.open && dock.mode === "info"}
              currentWorkspaceId={activeWorkspace?.id}
              onFocusNote={handleFocusNote}
              onOpenNoteInSideCards={(noteId) => openNoteInSideCards(noteId, { focusDock: true })}
              onPlaceNote={activeWorkspace ? (noteId) => handlePlaceNote(noteId) : undefined}
              onFilterByTag={() => {
                setLibraryDetailNoteId(null);
                openRightDockMode("library");
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <DockedOutlineView
        activeWorkspace={activeWorkspace}
        selectedNoteId={dock.selectedNoteId}
        onSelectHeading={(noteId, blockId) => {
          setDockHighlightBlockId(blockId ?? null);
          openNoteInSideCards(noteId, { focusDock: true, blockId });
          openRightDockMode("sidecards");
        }}
      />
    );
  };

  if (!dock.open) return null;

  return (
    <>
      {narrow && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close Right Sidebar"
          className="fixed inset-0 z-[var(--z-shell-backdrop)] bg-black/35"
          onClick={closeRightDock}
        />
      )}

      <aside
        aria-label="Right sidebar drawer"
        data-notespace-right-drawer={dock.mode}
        className={cn(
          "relative flex h-full min-h-0 shrink-0 border-l border-line bg-surface",
          narrow && "fixed right-0 top-0 bottom-0 z-[var(--z-shell-overlay)] max-w-full",
        )}
        style={{ width: narrow ? Math.min(dock.width, 360) : dock.width }}
      >
        {!narrow && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right sidebar"
            className="w-1.5 -ml-[3px] shrink-0 cursor-col-resize transition-colors hover:bg-accent/50"
            onPointerDown={startResize}
          />
        )}
        {resizingWidth !== null && (
          <span className="pointer-events-none absolute left-2 top-2 z-[var(--z-popover)] rounded bg-button px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-button-text">
            {resizingWidth}px
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-line/80 bg-sidebar/40 px-2.5"
            style={{ height: isWindowsCustom ? 68 : 36, paddingTop: isWindowsCustom ? 32 : 0 }}
          >
            <nav
              aria-label="Right sidebar tools"
              data-notespace-right-rail=""
              className="flex items-center gap-1"
            >
              {RAIL_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = dock.mode === item.mode;
                const showBadge = item.mode === "sidecards" && dock.sideCardIds.length > 0;
                return (
                  <div key={item.mode} className="relative">
                    <IconButton
                      ref={(el) => { railRefs.current[item.mode] = el; }}
                      type="button"
                      size="xs"
                      active={active}
                      data-right-rail-mode={item.mode}
                      aria-label={item.label}
                      aria-pressed={active}
                      title={`${item.label} · ${item.shortcut}`}
                      className={active ? undefined : "text-muted hover:bg-ink/[0.05] hover:text-ink"}
                      onClick={() => openRightDockMode(item.mode)}
                    >
                      <Icon size={14} aria-hidden="true" />
                    </IconButton>
                    {showBadge && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-button px-1 text-[9px] font-semibold tabular-nums text-button-text"
                      >
                        {dock.sideCardIds.length}
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>
            <IconButton
              type="button"
              size="xs"
              aria-label="Close right drawer"
              title="Hide side panel · Esc"
              className="text-muted hover:bg-ink/[0.05] hover:text-ink"
              onClick={closeRightDock}
            >
              <PanelRightClose size={14} aria-hidden="true" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {renderDrawerContent()}
          </div>
        </div>
      </aside>
    </>
  );
}
