import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { Mark as PMMark, Node as PMNode } from "@tiptap/pm/model";
import { useMemo, type ReactNode } from "react";
import type { NoteDocument } from "../../../../domain/note/note";
import { createNoteExtensions, isSafeNoteLink, NoteBlockReferenceCard, NoteEmbedCard } from "./note-extensions";
import { renderNoteLatex } from "./note-math";

const extensions = createNoteExtensions();

type NodeProps = { node: PMNode; children?: ReactNode };
type MarkProps = { mark: PMMark; children?: ReactNode };

function MathView({ latex, block }: { latex: string; block: boolean }) {
  // KaTeX escapes its input and `trust: false` blocks \href/\url-style commands (B14).
  const rendered = useMemo(() => renderNoteLatex(latex, block), [latex, block]);
  if (!rendered.ok) {
    return block
      ? <div className="notespace-note-math rounded border border-danger/40 bg-danger/10 px-2 py-1 font-mono text-[12px] text-danger" data-latex={latex} data-math-error="true" title={rendered.error}>{latex || "Invalid formula"}</div>
      : <span className="notespace-note-math rounded border border-danger/40 bg-danger/10 px-1 font-mono text-[12px] text-danger" data-latex={latex} data-math-error="true" title={rendered.error}>{latex || "Invalid formula"}</span>;
  }
  return block
    ? <div className="notespace-note-math" data-latex={latex} dangerouslySetInnerHTML={{ __html: rendered.html }} />
    : <span className="notespace-note-math" data-latex={latex} dangerouslySetInnerHTML={{ __html: rendered.html }} />;
}

const nodeMapping = {
  noteEmbed: ({ node }: NodeProps) => <NoteEmbedCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} label={node.attrs.label} />,
  noteBlockReference: ({ node }: NodeProps) => <NoteBlockReferenceCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} blockId={node.attrs.blockId} />,
  inlineMath: ({ node }: NodeProps) => <MathView latex={String(node.attrs.latex ?? "")} block={false} />,
  blockMath: ({ node }: NodeProps) => <MathView latex={String(node.attrs.latex ?? "")} block />,
  taskItem: ({ node, children }: NodeProps) => <li data-type="taskItem" data-checked={node.attrs.checked ? "true" : "false"}>
    <label><input type="checkbox" checked={Boolean(node.attrs.checked)} readOnly disabled tabIndex={-1} aria-label={node.attrs.checked ? "Done" : "Not done"} /></label>
    <div>{children}</div>
  </li>,
};

const markMapping = {
  // Stored documents may predate the input policy; unsafe targets render as plain text.
  link: ({ mark, children }: MarkProps) => {
    const href = typeof mark.attrs.href === "string" ? mark.attrs.href : "";
    if (!isSafeNoteLink(href)) return <span>{children}</span>;
    return href.startsWith("/") ? <a href={href}>{children}</a> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
};

function plainText(document: NoteDocument): string {
  const walk = (nodes: NoteDocument["content"]): string[] => nodes.flatMap((node) => [...(node.text ? [node.text] : []), ...(node.content ? walk(node.content) : [])]);
  return walk(document.content).join(" ").trim();
}

/** Read-only semantic rendering of a Note; it never mounts an editor (B9a). */
export function NoteReadView({ document }: { document: NoteDocument }) {
  const rendered = useMemo(() => {
    try {
      return renderToReactElement({ content: document, extensions, options: { nodeMapping, markMapping } });
    } catch {
      return null;
    }
  }, [document]);
  if (rendered === null) return <div className="notespace-note-content" data-note-read-view="fallback"><p>{plainText(document)}</p></div>;
  return <div className="notespace-note-content" data-note-read-view="">{rendered}</div>;
}
