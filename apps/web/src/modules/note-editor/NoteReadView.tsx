import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { Mark as PMMark, Node as PMNode } from "@tiptap/pm/model";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { isSafeNoteLink, type NoteDocument, type RichNoteDocument } from "../../entities/note";
import { createNoteExtensions } from "./extensions/create-note-extensions";
import { InternalNoteLink, NoteBlockReferenceCard, NoteEmbedCard } from "./extensions/note-links";
import {
  isPresetHighlightTone,
  isPresetTextColorTone,
  normalizeHighlightTone,
  normalizeTextColorTone,
} from "./extensions/note-marks";
import {
  toggleNoteToggleInDocument,
  toggleTaskInDocument,
  type NoteTaskToggleTarget,
} from "./model/note-extract";
import { renderNoteLatex, upgradeLatexDelimitersInDocument } from "./lib/note-math";
import { notePreviewDocument } from "./model/note-markdown";

export { toggleNoteToggleInDocument, toggleTaskInDocument, type NoteTaskToggleTarget };

const extensions = createNoteExtensions();

type NodeProps = { node: PMNode; children?: ReactNode };
type MarkProps = { mark: PMMark; children?: ReactNode };

export type NoteReadViewProps = {
  document: NoteDocument;
  onToggleTask?: (target: NoteTaskToggleTarget) => void;
  onToggleCollapse?: (blockId: string, open: boolean) => void;
  highlightBlockId?: string | null;
};

function MathView({ latex, block }: { latex: string; block: boolean }) {
  // KaTeX escapes its input and `trust: false` blocks \href/\url-style commands (B14).
  const rendered = useMemo(() => renderNoteLatex(latex, block), [latex, block]);
  if (!rendered.ok) {
    return block
      ? <div className="notespace-note-math rounded-md border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-[12px] text-danger" data-latex={latex} data-math-error="true" title={rendered.error}>{latex || "Invalid formula"}</div>
      : <span className="notespace-note-math rounded-md border border-danger/40 bg-danger/10 px-1 font-mono text-[12px] text-danger" data-latex={latex} data-math-error="true" title={rendered.error}>{latex || "Invalid formula"}</span>;
  }
  return block
    ? <div className="notespace-note-math" data-latex={latex} dangerouslySetInnerHTML={{ __html: rendered.html }} />
    : <span className="notespace-note-math" data-latex={latex} dangerouslySetInnerHTML={{ __html: rendered.html }} />;
}

const markMapping = {
  // Stored documents may predate the input policy; unsafe targets render as plain text.
  link: ({ mark, children }: MarkProps) => {
    const href = typeof mark.attrs.href === "string" ? mark.attrs.href : "";
    if (!isSafeNoteLink(href)) return <span>{children}</span>;
    return href.startsWith("/")
      ? <InternalNoteLink href={href}>{children}</InternalNoteLink>
      : <a className="pointer-events-auto" href={href} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()}>{children}</a>;
  },
  noteHighlight: ({ mark, children }: MarkProps) => {
    const tone = normalizeHighlightTone(mark.attrs.tone);
    if (isPresetHighlightTone(tone)) {
      return <mark data-note-highlight={tone} className={`notespace-note-hl notespace-note-hl-${tone}`}>{children}</mark>;
    }
    return (
      <mark
        data-note-highlight={tone}
        className="notespace-note-hl"
        style={{ backgroundColor: `color-mix(in srgb, ${tone} 34%, transparent)` }}
      >
        {children}
      </mark>
    );
  },
  noteTextColor: ({ mark, children }: MarkProps) => {
    const tone = normalizeTextColorTone(mark.attrs.tone);
    if (!tone) return <span>{children}</span>;
    if (isPresetTextColorTone(tone)) {
      return <span data-note-text-color={tone} className={`notespace-note-tc notespace-note-tc-${tone}`}>{children}</span>;
    }
    return <span data-note-text-color={tone} className="notespace-note-tc" style={{ color: tone }}>{children}</span>;
  },
};

function plainText(document: RichNoteDocument): string {
  const walk = (nodes: RichNoteDocument["content"]): string[] => nodes.flatMap((node) => [...(node.text ? [node.text] : []), ...(node.content ? walk(node.content) : [])]);
  return walk(document.content).join(" ").trim();
}

/** Read-only semantic rendering of a Note; it never mounts an editor (B9a). */
export function NoteReadView({
  document: source,
  onToggleTask,
  onToggleCollapse,
  highlightBlockId,
}: NoteReadViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const document = useMemo(() => notePreviewDocument(source), [source]);

  const rendered = useMemo(() => {
    let taskIndex = 0;
    const nodeMapping = {
      noteEmbed: ({ node }: NodeProps) => (
        <NoteEmbedCard
          noteId={node.attrs.noteId}
          workspaceId={node.attrs.workspaceId}
          label={node.attrs.label}
          blockId={node.attrs.blockId}
        />
      ),
      noteBlockReference: ({ node }: NodeProps) => (
        <NoteBlockReferenceCard
          noteId={node.attrs.noteId}
          workspaceId={node.attrs.workspaceId}
          blockId={node.attrs.blockId}
        />
      ),
      inlineMath: ({ node }: NodeProps) => <MathView latex={String(node.attrs.latex ?? "")} block={false} />,
      blockMath: ({ node }: NodeProps) => <MathView latex={String(node.attrs.latex ?? "")} block />,
      noteToggle: ({ node, children }: NodeProps) => {
        const open = node.attrs.open !== false;
        const blockId = typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
        const interactive = Boolean(onToggleCollapse && blockId);
        // Render as `<div>` (not `<details>`) so `NativePopupManager` never auto-collapses open toggles.
        const visibleChildren = open ? children : (Array.isArray(children) ? children.slice(0, 1) : children);
        return (
          <div
            className="notespace-note-toggle"
            data-note-toggle=""
            data-open={open ? "true" : "false"}
            data-note-block-id={blockId || undefined}
          >
            <button
              type="button"
              className={"notespace-note-toggle-trigger" + (interactive ? " pointer-events-auto cursor-pointer" : "")}
              aria-expanded={open}
              aria-label={open ? "Collapse toggle" : "Expand toggle"}
              disabled={!interactive}
              onPointerDown={interactive ? (event) => event.stopPropagation() : undefined}
              onDoubleClick={interactive ? (event) => event.stopPropagation() : undefined}
              onClick={interactive ? (event) => {
                event.stopPropagation();
                onToggleCollapse?.(blockId, !open);
              } : undefined}
            >
              <ChevronRight
                className={"size-3.5 transition-transform duration-100 " + (open ? "rotate-90" : "")}
                aria-hidden="true"
              />
            </button>
            <div className="notespace-note-toggle-content">{visibleChildren}</div>
          </div>
        );
      },
      noteToggleSummary: ({ children }: NodeProps) => (
        <div data-note-toggle-summary="" className="notespace-note-toggle-summary">
          {children}
        </div>
      ),
      taskItem: ({ node, children }: NodeProps) => {
        const checked = Boolean(node.attrs.checked);
        const currentIndex = taskIndex;
        taskIndex += 1;
        const blockId = typeof node.attrs.blockId === "string" && node.attrs.blockId
          ? node.attrs.blockId
          : (typeof node.firstChild?.attrs?.blockId === "string" && node.firstChild.attrs.blockId
              ? node.firstChild.attrs.blockId
              : undefined);
        return (
          <li data-type="taskItem" data-checked={checked ? "true" : "false"}>
            {onToggleTask ? (
              <label
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="pointer-events-auto cursor-pointer"
                  checked={checked}
                  aria-label={checked ? "Mark task incomplete" : "Mark task complete"}
                  onChange={(event) => {
                    event.stopPropagation();
                    onToggleTask({ blockId, index: currentIndex, checked: !checked });
                  }}
                />
              </label>
            ) : (
              <label>
                <input type="checkbox" checked={checked} readOnly disabled tabIndex={-1} aria-label={checked ? "Done" : "Not done"} />
              </label>
            )}
            <div>{children}</div>
          </li>
        );
      },
    };
    try {
      return renderToReactElement({ content: upgradeLatexDelimitersInDocument(document), extensions, options: { nodeMapping, markMapping } });
    } catch {
      return null;
    }
  }, [document, onToggleCollapse, onToggleTask]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-note-block-highlight]").forEach((element) => {
      element.removeAttribute("data-note-block-highlight");
      element.classList.remove("notespace-note-block-highlight");
    });
    if (!highlightBlockId) return;
    const target = [...root.querySelectorAll<HTMLElement>("[data-note-block-id]")]
      .find((element) => element.getAttribute("data-note-block-id") === highlightBlockId);
    if (!target) return;
    target.setAttribute("data-note-block-highlight", "true");
    target.classList.add("notespace-note-block-highlight");
    const scroller = root.closest<HTMLElement>("[data-note-scroll]");
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      const targetRect = target.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      if (targetRect.top < scrollerRect.top || targetRect.bottom > scrollerRect.bottom) {
        scroller.scrollTop += targetRect.top - scrollerRect.top - 16;
      }
    }
  }, [highlightBlockId, document]);

  if (rendered === null) return <div ref={rootRef} className="notespace-note-content" data-note-read-view="fallback"><p>{plainText(document)}</p></div>;
  return <div ref={rootRef} className="notespace-note-content" data-note-read-view="">{rendered}</div>;
}
