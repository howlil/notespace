import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ChevronRight, Info, Plus, X } from "lucide-react";
import { noteFirstLine, type NoteDocument } from "../../entities/note";
import {
  getNoteInfo,
  updateNote,
  type Note,
  type NoteBacklinkInfo,
  type NotePlacementInfo,
} from "../../platform/api/note-api";
import { assignNoteTag, removeNoteTag, type Tag } from "../../platform/api/tag-api";
import { Button, CardEntityIcon, IconButton, WorkspaceEntityIcon, cn } from "../../shared/ui";
import { MarkdownNoteEditor } from "./MarkdownNoteEditor";
import { NoteInfoContent } from "./NoteInfoContent";
import { NoteInfoPopover } from "./NoteInfoPopover";
import { TagPickerChips } from "./TagPickerChips";
import { joinCardDocument, splitCardDocument } from "./model/card-document-sections";

export type CardDetailViewProps = {
  initialNote: Note;
  historyControls?: ReactNode;
  parentLink?: ReactNode;
  onPlaceOnWorkspace: (note: Note) => void;
  onOpenRelatedCard: (noteId: string) => void;
  onNavigateToWorkspace?: (workspaceId: string, noteId: string) => void;
};

const SAVE_STATUS_META = {
  saved: { label: "Saved", dotClass: "bg-success", textClass: "text-muted", urgent: false },
  saving: { label: "Saving…", dotClass: "bg-accent", textClass: "text-muted", urgent: false },
  error: { label: "Save failed", dotClass: "bg-danger", textClass: "text-danger", urgent: true },
} as const;

function useDesktopInspectorLayout() {
  const [wide, setWide] = useState(() => (
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia("(min-width: 920px)").matches
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(min-width: 920px)");
    setWide(query.matches);
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return wide;
}

function clickedCharacterOffset(clientX: number, clientY: number): number | null {
  if (typeof document === "undefined") return null;
  const docWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof docWithCaret.caretPositionFromPoint === "function") {
    return docWithCaret.caretPositionFromPoint(clientX, clientY)?.offset ?? null;
  }
  if (typeof docWithCaret.caretRangeFromPoint === "function") {
    return docWithCaret.caretRangeFromPoint(clientX, clientY)?.startOffset ?? null;
  }
  return null;
}

/**
 * Full-page Heptabase-inspired Card editor inside the main shell surface:
 * calm top utility bar, top tags above direct editable headline, flowing
 * Markdown body without dividing cages, bottom Workspaces & Backlinks context,
 * and collapsible right Card Info inspector.
 */
export function CardDetailView({
  initialNote,
  historyControls,
  parentLink,
  onPlaceOnWorkspace,
  onOpenRelatedCard,
  onNavigateToWorkspace,
}: CardDetailViewProps) {
  const initialSections = useMemo(
    () => splitCardDocument(initialNote.document.text),
    [initialNote.document.text],
  );
  const [note, setNote] = useState<Note>(initialNote);
  const [headline, setHeadline] = useState<string>(initialSections.headline);
  const [bodyText, setBodyText] = useState<string>(initialSections.body);
  const [editingTitle, setEditingTitle] = useState<boolean>(
    () => initialNote.document.text.trim() === "",
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [placements, setPlacements] = useState<NotePlacementInfo[]>([]);
  const [backlinks, setBacklinks] = useState<NoteBacklinkInfo[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const desktopInspector = useDesktopInspectorLayout();

  const noteIdRef = useRef<string>(initialNote.id);
  const prefixRef = useRef<"# " | "">(initialSections.prefix);
  const headlineRef = useRef<string>(initialSections.headline);
  const bodyRef = useRef<string>(initialSections.body);
  const latestDocRef = useRef<NoteDocument>(initialNote.document);
  const bodyDocRef = useRef<NoteDocument>({ type: "markdown", text: initialSections.body });
  const revisionRef = useRef<number>(initialNote.revision);
  const dirtyRef = useRef<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sections = splitCardDocument(initialNote.document.text);
    const isBlankCard = initialNote.document.text.trim() === "";
    noteIdRef.current = initialNote.id;
    prefixRef.current = sections.prefix;
    headlineRef.current = sections.headline;
    bodyRef.current = sections.body;
    latestDocRef.current = initialNote.document;
    bodyDocRef.current = { type: "markdown", text: sections.body };
    revisionRef.current = initialNote.revision;
    dirtyRef.current = false;

    setNote(initialNote);
    setHeadline(sections.headline);
    setBodyText(sections.body);
    setEditingTitle(isBlankCard);
    setSaveState("saved");
    setSaveError(null);

    if (isBlankCard) {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
      });
    }

    let mounted = true;
    void getNoteInfo(initialNote.id)
      .then((info) => {
        if (!mounted) return;
        setTags(info.tags ?? []);
        setPlacements(info.placements ?? []);
        setBacklinks(info.backlinks ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setTags([]);
        setPlacements([]);
        setBacklinks([]);
      });
    return () => {
      mounted = false;
    };
  }, [initialNote]);

  const persistDocument = useCallback(async (targetNoteId: string, doc: NoteDocument) => {
    setSaveState("saving");
    setSaveError(null);
    dirtyRef.current = false;
    try {
      const updated = await updateNote(targetNoteId, doc, revisionRef.current);
      if (noteIdRef.current !== targetNoteId) return;
      revisionRef.current = updated.revision;
      setNote((prev) => ({
        ...updated,
        document: dirtyRef.current ? prev.document : updated.document,
      }));
      setSaveState("saved");
    } catch (err) {
      if (noteIdRef.current !== targetNoteId) return;
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Could not save card.");
    }
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (dirtyRef.current) {
        void updateNote(noteIdRef.current, latestDocRef.current, revisionRef.current).catch(() => undefined);
      }
    }
  }, []);

  const scheduleDocumentSave = useCallback((doc: NoteDocument) => {
    latestDocRef.current = doc;
    dirtyRef.current = true;
    setNote((prev) => ({ ...prev, document: doc }));
    const targetId = noteIdRef.current;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistDocument(targetId, doc);
    }, 350);
  }, [persistDocument]);

  const handleHeadlineChange = useCallback((nextHeadline: string) => {
    headlineRef.current = nextHeadline;
    setHeadline(nextHeadline);
    const fullText = joinCardDocument(nextHeadline, bodyRef.current, prefixRef.current);
    scheduleDocumentSave({ type: "markdown", text: fullText });
  }, [scheduleDocumentSave]);

  const handleBodyChange = useCallback((doc: NoteDocument) => {
    bodyRef.current = doc.text;
    bodyDocRef.current = doc;
    setBodyText(doc.text);
    const fullText = joinCardDocument(headlineRef.current, doc.text, prefixRef.current);
    scheduleDocumentSave({ type: "markdown", text: fullText });
  }, [scheduleDocumentSave]);

  const focusEditor = useCallback(() => {
    const contentDom = editorRegionRef.current?.querySelector<HTMLElement>(".cm-content");
    contentDom?.focus();
  }, []);

  const beginTitleEdit = useCallback((event?: MouseEvent<HTMLHeadingElement>) => {
    const offset = event ? clickedCharacterOffset(event.clientX, event.clientY) : null;
    setEditingTitle(true);
    requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      const targetPos = headlineRef.current
        ? Math.min(headlineRef.current.length, Math.max(0, offset ?? headlineRef.current.length))
        : 0;
      input.setSelectionRange(targetPos, targetPos);
    });
  }, []);

  const derivedTitle = headline.trim() || noteFirstLine(note.document).trim() || "Untitled card";
  const hasNamedTitle = Boolean(headline.trim() || noteFirstLine(note.document).trim());
  const status = SAVE_STATUS_META[saveState];
  const bodyDocument = useMemo<NoteDocument>(
    () => ({ type: "markdown", text: bodyText }),
    [bodyText],
  );

  return (
    <div className="flex min-h-full w-full flex-1 flex-col bg-surface">
      <header
        className="sticky top-0 z-[var(--z-sticky)] flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line/70 bg-surface/95 px-4 backdrop-blur-sm max-[760px]:pl-11"
        style={{ paddingRight: "calc(16px + var(--desktop-top-right-inset, 0px))" }}
      >
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
          {historyControls}
          {(historyControls && parentLink) && (
            <span className="mx-0.5 h-3.5 w-px bg-line" aria-hidden="true" />
          )}
          {(parentLink || derivedTitle) && (
            <nav aria-label="Card breadcrumb" className="flex min-w-0 items-center gap-0.5">
              {parentLink}
              {parentLink && <ChevronRight size={11} className="shrink-0 opacity-60" aria-hidden="true" />}
              <span className="truncate px-1 font-medium text-ink">{derivedTitle}</span>
            </nav>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {saveState !== "saved" && (
            <span
              className={cn("inline-flex items-center gap-1.5 px-2 text-xs font-medium", status.textClass)}
              role={status.urgent ? "alert" : "status"}
              aria-live="polite"
            >
              <span className={cn("size-1.5 rounded-full", status.dotClass)} aria-hidden="true" />
              <span>{saveState === "error" ? (saveError ?? status.label) : status.label}</span>
            </span>
          )}
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            active={infoOpen}
            title="Card info & backlinks"
            aria-label="Note info and backlinks"
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen((prev) => !prev)}
          >
            <Info size={14} aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col cursor-text"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              focusEditor();
            }
          }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[740px] flex-1 flex-col px-8 pt-8 pb-20 max-[600px]:px-5 max-[600px]:pt-6">
            <div>
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                <TagPickerChips
                  tags={tags}
                  compact
                  onAssignTag={async (tag) => {
                    await assignNoteTag(note.id, tag.id);
                    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
                  }}
                  onRemoveTag={async (tagId) => {
                    await removeNoteTag(note.id, tagId);
                    setTags((prev) => prev.filter((t) => t.id !== tagId));
                  }}
                />
              </div>

              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={headline}
                  aria-label="Card title"
                  placeholder="Untitled card"
                  onChange={(event) => handleHeadlineChange(event.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "ArrowDown") {
                      event.preventDefault();
                      setEditingTitle(false);
                      focusEditor();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full border-0 bg-transparent p-0 text-[26px] font-semibold leading-[1.25] tracking-tight text-ink placeholder:text-muted/45 focus:outline-none"
                />
              ) : (
                <h1
                  tabIndex={0}
                  onClick={beginTitleEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      beginTitleEdit();
                    }
                  }}
                  className={cn(
                    "m-0 -mx-1.5 cursor-text rounded-md px-1.5 py-0.5 text-[26px] font-semibold leading-[1.25] tracking-tight transition-colors hover:bg-tint/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    hasNamedTitle ? "text-ink" : "text-muted/50",
                  )}
                >
                  {derivedTitle}
                </h1>
              )}
            </div>

            <div
              ref={editorRegionRef}
              className="mt-3.5 flex min-h-[260px] flex-1 flex-col text-base leading-[1.65]"
            >
              <MarkdownNoteEditor
                key={note.id}
                noteId={note.id}
                workspaceId=""
                document={bodyDocument}
                minHeight={260}
                fillContainer
                autoFocus={false}
                placeholder="Start writing, or type @ to link a card…"
                onDocumentChange={handleBodyChange}
                readDocument={() => bodyDocRef.current}
                onResize={() => undefined}
                onError={(message) => {
                  setSaveState("error");
                  setSaveError(message);
                }}
                onEscape={() => undefined}
              />
            </div>

            <section
              aria-label="Card connections"
              className="mt-10 space-y-5 border-t border-line/70 pt-5"
            >
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-muted">
                    Placed in Workspaces ({placements.length})
                  </h2>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-muted hover:text-ink"
                    onClick={() => onPlaceOnWorkspace(note)}
                  >
                    <Plus size={11} aria-hidden="true" />
                    <span>Place on board</span>
                  </Button>
                </div>
                {placements.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {placements.map((placement) => (
                      <button
                        key={placement.instanceId}
                        type="button"
                        onClick={() => onNavigateToWorkspace?.(placement.workspaceId, note.id)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-tint"
                      >
                        <WorkspaceEntityIcon size={13} className="shrink-0 text-muted" />
                        <span className="truncate max-w-[220px]">
                          {placement.workspaceTitle.trim() || "Untitled workspace"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {backlinks.length > 0 && (
                <div>
                  <h2 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Backlinks ({backlinks.length})
                  </h2>
                  <div className="grid gap-2">
                    {backlinks.map((backlink) => (
                      <button
                        key={`${backlink.noteId}-${backlink.kind}`}
                        type="button"
                        onClick={() => onOpenRelatedCard(backlink.noteId)}
                        className="flex flex-col gap-0.5 rounded-lg border border-line bg-canvas px-3 py-2 text-left transition-colors hover:border-accent hover:bg-tint"
                      >
                        <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                          <CardEntityIcon size={13} className="shrink-0 text-muted" />
                          <span className="truncate">{backlink.label.trim() || "Untitled card"}</span>
                        </div>
                        {backlink.excerpt && (
                          <div className="line-clamp-2 pl-[19px] text-xs text-muted">
                            {backlink.excerpt}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {infoOpen && desktopInspector && (
          <aside
            aria-label="Card info"
            data-card-info-panel=""
            className="sticky top-10 flex h-[calc(100dvh-40px)] w-[300px] shrink-0 self-start flex-col border-l border-line bg-canvas/55"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-line/70 px-3.5">
              <span className="text-sm font-semibold text-ink">Card info</span>
              <IconButton
                type="button"
                size="xs"
                variant="ghost"
                aria-label="Close card info"
                onClick={() => setInfoOpen(false)}
              >
                <X size={13} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3.5 no-scrollbar">
              <NoteInfoContent
                active
                noteId={note.id}
                onOpenNoteInSideCards={(relatedId: string) => {
                  onOpenRelatedCard(relatedId);
                }}
                onPlaceNote={() => onPlaceOnWorkspace(note)}
              />
            </div>
          </aside>
        )}
      </div>

      {!desktopInspector && (
        <NoteInfoPopover
          open={infoOpen}
          onOpenChange={setInfoOpen}
          noteId={note.id}
          noteLabel={derivedTitle}
          onOpenNoteInSideCards={(relatedId: string) => {
            setInfoOpen(false);
            onOpenRelatedCard(relatedId);
          }}
          onPlaceNote={() => {
            setInfoOpen(false);
            onPlaceOnWorkspace(note);
          }}
        />
      )}
    </div>
  );
}
