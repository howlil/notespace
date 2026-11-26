import type { Token, Tokens } from "marked";
import "katex/dist/katex.min.css";
import { ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import { isNoteAssetSrc, isSafeNoteLink, type NoteDocument } from "../../entities/note";
import { renderNoteLatex } from "./lib/note-math";
import {
  decodeEntities,
  highlightTone,
  inlineText,
  isPresetTone,
  lexNote,
  noteBlocks,
  parseInlineTag,
  parseNoteRoute,
  textColorTone,
  type InlineTag,
  type NoteToken,
} from "./model/note-markdown";
import { InternalNoteLink, NoteBlockReferenceCard, NoteEmbedCard } from "./NoteReferenceCards";

export type NoteReadViewProps = {
  document: NoteDocument;
  /** Task `index` counts `- [ ]` items in source order. */
  onToggleTask?: (index: number, checked: boolean) => void;
  /** Toggle `index` counts `<details>` blocks in source order. */
  onToggleDetails?: (index: number, open: boolean) => void;
  highlightBlockId?: string | null;
};

type Ctx = Pick<NoteReadViewProps, "onToggleTask" | "onToggleDetails"> & { tasks: number };

function MathView({ latex, block }: { latex: string; block: boolean }) {
  // KaTeX escapes its input and `trust: false` blocks \href/\url-style commands (B14).
  const rendered = useMemo(() => renderNoteLatex(latex, block), [latex, block]);
  const Tag = block ? "div" : "span";
  if (!rendered.ok) {
    return (
      <Tag
        className={"notespace-note-math rounded-md border border-danger/40 bg-danger/10 font-mono text-[12px] text-danger " + (block ? "px-2 py-1" : "px-1")}
        data-latex={latex}
        data-math-error="true"
        title={rendered.error}
      >
        {latex || "Invalid formula"}
      </Tag>
    );
  }
  return <Tag className="notespace-note-math" data-latex={latex} dangerouslySetInnerHTML={{ __html: rendered.html }} />;
}

function wrapTag(tag: InlineTag, children: ReactNode[], key: number): ReactNode {
  if (tag.name === "u") return <u key={key}>{children}</u>;
  if (tag.name === "mark") {
    const tone = highlightTone(tag.value);
    return isPresetTone(tone)
      ? <mark key={key} data-note-highlight={tone} className={`notespace-note-hl notespace-note-hl-${tone}`}>{children}</mark>
      : <mark key={key} data-note-highlight={tone} className="notespace-note-hl" style={{ backgroundColor: `color-mix(in srgb, ${tone} 34%, transparent)` }}>{children}</mark>;
  }
  const tone = textColorTone(tag.value);
  if (!tone) return <span key={key}>{children}</span>;
  return isPresetTone(tone)
    ? <span key={key} data-note-text-color={tone} className={`notespace-note-tc notespace-note-tc-${tone}`}>{children}</span>
    : <span key={key} data-note-text-color={tone} className="notespace-note-tc" style={{ color: tone }}>{children}</span>;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  // Stored text may predate the link policy; unsafe targets render as plain text.
  if (!isSafeNoteLink(href)) return <span>{children}</span>;
  return href.startsWith("/")
    ? <InternalNoteLink href={href}>{children}</InternalNoteLink>
    : <a className="pointer-events-auto" href={href} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()}>{children}</a>;
}

function inline(tokens: readonly Token[] | undefined, ctx: Ctx): ReactNode[] {
  const root: ReactNode[] = [];
  const open: { tag: InlineTag; children: ReactNode[] }[] = [];
  const push = (node: ReactNode) => (open.at(-1)?.children ?? root).push(node);
  const closeLast = () => {
    const frame = open.pop();
    if (frame) push(wrapTag(frame.tag, frame.children, root.length + open.length));
  };

  (tokens ?? []).forEach((token, key) => {
    switch (token.type) {
      case "text":
        push(token.tokens?.length ? <Fragment key={key}>{inline(token.tokens, ctx)}</Fragment> : decodeEntities(String(token.text)));
        return;
      case "escape":
        push(String(token.text));
        return;
      case "strong":
        push(<strong key={key}>{inline(token.tokens, ctx)}</strong>);
        return;
      case "em":
        push(<em key={key}>{inline(token.tokens, ctx)}</em>);
        return;
      case "del":
        push(<s key={key}>{inline(token.tokens, ctx)}</s>);
        return;
      case "codespan":
        push(<code key={key}>{String(token.text)}</code>);
        return;
      case "br":
        push(<br key={key} />);
        return;
      case "inlineMath":
        push(<MathView key={key} latex={String(token.text)} block={false} />);
        return;
      case "link":
        push(<Link key={key} href={(token as Tokens.Link).href}>{inline(token.tokens, ctx)}</Link>);
        return;
      case "image": {
        const image = token as Tokens.Image;
        push(isNoteAssetSrc(image.href)
          ? <img key={key} data-notespace-note-image="true" className="max-h-64 w-full rounded-lg object-contain" src={image.href} alt={image.text} loading="lazy" draggable={false} />
          : <Fragment key={key}>{image.text}</Fragment>);
        return;
      }
      case "html": {
        const tag = parseInlineTag(token.raw);
        if (!tag) push(token.raw);
        else if (tag.name === "br") push(<br key={key} />);
        else if (!tag.closing) open.push({ tag, children: [] });
        else if (open.at(-1)?.tag.name === tag.name) closeLast();
        else push(token.raw);
        return;
      }
      default:
        push(String(token.raw));
    }
  });
  while (open.length) closeLast();
  return root;
}

/** A paragraph that is only an embed image or a block-reference link is drawn as a live card. */
function referenceCard(token: NoteToken): ReactNode | null {
  const only = token.tokens?.length === 1 ? token.tokens[0] : null;
  if (only?.type === "image") {
    const route = parseNoteRoute((only as Tokens.Image).href);
    if (route) return <NoteEmbedCard noteId={route.noteId} workspaceId={route.workspaceId} label={(only as Tokens.Image).text} blockId={token.blockId} />;
  }
  if (only?.type === "link") {
    const route = parseNoteRoute((only as Tokens.Link).href);
    if (route?.blockId) return <NoteBlockReferenceCard noteId={route.noteId} workspaceId={route.workspaceId} blockId={route.blockId} ownBlockId={token.blockId} />;
  }
  return null;
}

function blocks(tokens: readonly Token[], ctx: Ctx): ReactNode[] {
  return tokens.map((token, key) => block(token as NoteToken, ctx, key));
}

function block(token: NoteToken, ctx: Ctx, key: number): ReactNode {
  const id = token.blockId;
  switch (token.type) {
    case "heading": {
      const Tag = `h${Math.min(6, Math.max(1, token.depth))}` as "h1";
      return <Tag key={key} data-note-block-id={id}>{inline(token.tokens, ctx)}</Tag>;
    }
    case "paragraph":
      return referenceCard(token) ?? <p key={key} data-note-block-id={id}>{inline(token.tokens, ctx)}</p>;
    case "text":
      return <Fragment key={key}>{inline(token.tokens, ctx)}</Fragment>;
    case "blockquote":
      return <blockquote key={key} data-note-block-id={id}>{blocks(token.tokens ?? [], ctx)}</blockquote>;
    case "callout":
      return (
        <div key={key} className={`notespace-note-callout notespace-note-callout-${token.tone}`} data-note-callout={token.tone} data-note-block-id={id}>
          {blocks(token.tokens ?? [], ctx)}
        </div>
      );
    case "code":
      return <pre key={key} data-note-block-id={id}><code>{String(token.text)}</code></pre>;
    case "hr":
      return <hr key={key} data-note-block-id={id} />;
    case "blockMath":
      return <MathView key={key} latex={String(token.text)} block />;
    case "details": {
      const interactive = Boolean(ctx.onToggleDetails);
      const open = Boolean(token.open);
      const index = Number(token.index);
      // A <div>, not <details>, so NativePopupManager never auto-collapses open toggles.
      return (
        <div key={key} className="notespace-note-toggle" data-note-toggle="" data-open={open ? "true" : "false"} data-note-block-id={id}>
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
              ctx.onToggleDetails?.(index, !open);
            } : undefined}
          >
            <ChevronRight className={"size-3.5 transition-transform duration-100 " + (open ? "rotate-90" : "")} aria-hidden="true" />
          </button>
          <div className="notespace-note-toggle-content">
            <div data-note-toggle-summary="" className="notespace-note-toggle-summary">{String(token.summary) || "Toggle"}</div>
            {open && blocks(token.tokens ?? [], ctx)}
          </div>
        </div>
      );
    }
    case "list": {
      const list = token as Tokens.List & NoteToken;
      const Tag = list.ordered ? "ol" : "ul";
      const tasks = list.items.some((item) => item.task);
      return (
        <Tag key={key} data-note-block-id={id} data-type={tasks ? "taskList" : undefined} start={list.ordered && list.start !== 1 ? Number(list.start) : undefined}>
          {list.items.map((item, itemKey) => {
            const itemId = (item.tokens[0] as NoteToken | undefined)?.blockId;
            if (!item.task) return <li key={itemKey} data-note-block-id={itemId}>{blocks(item.tokens, ctx)}</li>;
            const index = ctx.tasks++;
            const checked = Boolean(item.checked);
            return (
              <li key={itemKey} data-type="taskItem" data-checked={checked ? "true" : "false"} data-note-block-id={itemId}>
                {ctx.onToggleTask ? (
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
                        ctx.onToggleTask?.(index, !checked);
                      }}
                    />
                  </label>
                ) : (
                  <label>
                    <input type="checkbox" checked={checked} readOnly disabled tabIndex={-1} aria-label={checked ? "Done" : "Not done"} />
                  </label>
                )}
                <div>{blocks(item.tokens, ctx)}</div>
              </li>
            );
          })}
        </Tag>
      );
    }
    case "table": {
      const table = token as Tokens.Table & NoteToken;
      const align = (index: number) => table.align[index] ?? undefined;
      return (
        <table key={key} data-note-block-id={id}>
          <thead>
            <tr>{table.header.map((cell, i) => <th key={i} style={{ textAlign: align(i) }}>{inline(cell.tokens, ctx)}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, i) => <td key={i} style={{ textAlign: align(i) }}>{inline(cell.tokens, ctx)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    }
    default:
      // Unsupported markup stays legible as authored text; React escapes it.
      return token.raw.trim() ? <p key={key}>{token.raw.trimEnd()}</p> : null;
  }
}

/** Read-only semantic rendering of a Note; it never mounts an editor (B9a). */
export function NoteReadView({ document, onToggleTask, onToggleDetails, highlightBlockId }: NoteReadViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const text = document.text;

  // Lexing depends on the text alone; pan, zoom and selection never re-parse a Note.
  const parsed = useMemo(() => {
    try {
      return noteBlocks(lexNote({ type: "markdown", text }));
    } catch {
      return null;
    }
  }, [text]);
  const rendered = useMemo(() => {
    try {
      return parsed && blocks(parsed, { tasks: 0, onToggleTask, onToggleDetails });
    } catch {
      return null;
    }
  }, [parsed, onToggleTask, onToggleDetails]);

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
  }, [highlightBlockId, text]);

  if (rendered === null) return <div ref={rootRef} className="notespace-note-content" data-note-read-view="fallback"><p>{inlineText([{ type: "text", raw: text, text }])}</p></div>;
  return <div ref={rootRef} className="notespace-note-content" data-note-read-view="">{rendered}</div>;
}
