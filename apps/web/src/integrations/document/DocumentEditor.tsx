import type { Editor, JSONContent } from "@tiptap/core";
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import UniqueID from "@tiptap/extension-unique-id";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Code2, Download, Heading2, List, ListOrdered, ListTree, Minus, Quote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Snapshot } from "../../domain/project/project";
import { looksLikeMarkdown, markdownToSnapshot, snapshotAssetIds, snapshotToMarkdown } from "../../domain/document/markdown";
import { cn } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";
import { blobToDataUrl, createLocalAssetId, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";

type FocusRequest = { id: string; request: number } | null;
type HighlightRequest = number | null;
type OutlineItem = { id: string; level: number; text: string };
type EditorJson = { type?: string; content?: JSONContent[] };

const editorClassName = cn(
  "h-full min-h-[350px] flex-1 overflow-x-hidden overflow-y-auto px-[30px] pt-[27px] pb-20 text-sm leading-[1.9] outline-none [overflow-wrap:anywhere] [scrollbar-width:none] [-ms-overflow-style:none]",
  "[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0",
  "[&>*+*]:mt-3 [&_p]:my-2",
  "[&_mark]:rounded-sm [&_mark]:bg-[color-mix(in_srgb,var(--accent)_32%,transparent)] [&_mark]:px-0.5 [&_mark]:text-inherit",
  "[&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:float-left [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:h-0 [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:pointer-events-none [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:text-muted [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:content-['Start_writing...']",
  "[&_h1]:mt-7 [&_h1]:text-[27px] [&_h2]:mt-[25px] [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:leading-[1.4] [&_h2]:tracking-[-.5px] [&_h2]:text-ink [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-ink",
  "[&_ul]:list-disc [&_ul]:pl-[23px] [&_ol]:list-decimal [&_ol]:pl-[23px]",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_ul[data-type=taskList]_li]:relative [&_ul[data-type=taskList]_li]:pl-6 [&_ul[data-type=taskList]_li::before]:absolute [&_ul[data-type=taskList]_li::before]:top-[.65em] [&_ul[data-type=taskList]_li::before]:left-0 [&_ul[data-type=taskList]_li::before]:size-[11px] [&_ul[data-type=taskList]_li::before]:rounded-[3px] [&_ul[data-type=taskList]_li::before]:border [&_ul[data-type=taskList]_li::before]:border-muted [&_ul[data-type=taskList]_li::before]:content-['']",
  "[&_pre]:overflow-auto [&_pre]:whitespace-pre [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-background [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-[1.7]",
  "[&_code]:rounded-[3px] [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[.88em] [&_pre_code]:p-0",
  "[&_a]:text-accent [&_a]:underline [&_blockquote]:border-0 [&_blockquote]:pl-0 [&_blockquote]:text-muted",
  "max-[1150px]:px-[22px] max-[1150px]:pt-[25px] max-[1150px]:pb-[60px] max-[800px]:px-[18px] max-[800px]:pt-[22px] max-[800px]:pb-[70px]",
);

// Retain the legacy task-list schema so existing authored snapshots remain
// readable. New checklist creation stays hidden until checked-state interaction
// has a complete persistence contract.
const TaskList = TiptapNode.create({
  name: "taskList",
  group: "block",
  content: "taskItem+",
  parseHTML() { return [{ tag: 'ul[data-type="taskList"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["ul", mergeAttributes(HTMLAttributes, { "data-type": "taskList" }), 0]; },
});

const TaskItem = TiptapNode.create({
  name: "taskItem",
  content: "paragraph block*",
  defining: true,
  parseHTML() { return [{ tag: 'li[data-type="taskItem"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["li", mergeAttributes(HTMLAttributes, { "data-type": "taskItem" }), 0]; },
});

function findBlockPosition(editor: Editor, blockId: string) {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.blockId === blockId) { position = pos + 1; return false; }
    return true;
  });
  return position;
}

function selectedBlockId(editor: Editor) {
  const blockId = editor.state.selection.$from.parent.attrs.blockId;
  return typeof blockId === "string" ? blockId : null;
}

function outlineItems(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "heading") return true;
    const id = node.attrs.blockId;
    if (typeof id === "string" && node.textContent.trim()) items.push({ id, level: Number(node.attrs.level) || 1, text: node.textContent.trim() });
    return true;
  });
  return items;
}

type SlashCommand = { label: string; description: string; keywords: string; icon: LucideIcon; run: (editor: Editor) => void };

const slashCommands: SlashCommand[] = [
  { label: "Heading", description: "Large section heading", keywords: "heading h2", icon: Heading2, run: (editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
  { label: "Bullet list", description: "Turn this into a list", keywords: "bullet list ul", icon: List, run: (editor) => { editor.chain().focus().toggleBulletList().run(); } },
  { label: "Numbered list", description: "Create an ordered list", keywords: "numbered ordered list ol", icon: ListOrdered, run: (editor) => { editor.chain().focus().toggleOrderedList().run(); } },
  { label: "Quote", description: "Highlight a passage", keywords: "quote blockquote", icon: Quote, run: (editor) => { editor.chain().focus().toggleBlockquote().run(); } },
  { label: "Code block", description: "Write formatted code", keywords: "code pre", icon: Code2, run: (editor) => { editor.chain().focus().toggleCodeBlock().run(); } },
  { label: "Divider", description: "Add a horizontal rule", keywords: "divider rule line", icon: Minus, run: (editor) => { editor.chain().focus().setHorizontalRule().run(); } },
];

type SlashMenu = { from: number; query: string; x: number; y: number } | null;

function LocalImageView({ node, workspaceId }: NodeViewProps & { workspaceId: string }) {
  const assetId = typeof node.attrs.assetId === "string" ? node.attrs.assetId : "";
  const fallbackSrc = typeof node.attrs.src === "string" && !node.attrs.src.startsWith("notespace-asset:") ? node.attrs.src : null;
  const [src, setSrc] = useState<string | null>(fallbackSrc);

  useEffect(() => {
    if (!assetId) { setSrc(fallbackSrc); return; }
    let active = true;
    let objectUrl: string | null = null;
    setSrc(null);
    void loadImageAsset(workspaceId, assetId).then((asset) => {
      if (!active || !asset) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setSrc(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId, fallbackSrc, workspaceId]);

  return (
    <NodeViewWrapper className="my-3.5 block max-w-full">
      {src ? <img className="block h-auto max-w-full rounded-lg border border-line" src={src} alt={node.attrs.alt || "Pasted image"} draggable={false} /> : <span className="block rounded-lg border border-dashed border-line p-3 text-[11px] text-muted">Image could not be loaded.</span>}
    </NodeViewWrapper>
  );
}

function createLocalImageExtension(workspaceId: string) {
  return TiptapNode.create({
    name: "image", group: "block", atom: true, draggable: true, selectable: true,
    addAttributes() { return { assetId: { default: null }, src: { default: null }, alt: { default: "Pasted image" } }; },
    parseHTML() { return [{ tag: "img[src]" }]; },
    renderHTML({ HTMLAttributes }) { const attributes = { ...HTMLAttributes }; delete attributes.assetId; return ["img", mergeAttributes(attributes)]; },
    addNodeView() { return ReactNodeViewRenderer((props) => <LocalImageView {...props} workspaceId={workspaceId} />); },
  });
}

export default function DocumentEditor({ initial, onChange, onBlockSelect, focusRequest, highlightRequest = null, workspaceId, toolbarTargetId }: { initial: Snapshot; onChange: (snapshot: Snapshot) => void; onBlockSelect?: (blockId: string | null, hasTextSelection: boolean) => void; focusRequest?: FocusRequest; highlightRequest?: HighlightRequest; workspaceId: string; toolbarTargetId?: string }) {
  const { showToast } = useToast();
  const slashMenuRef = useRef<SlashMenu>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const selectedCommandRef = useRef(0);
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(null);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [toolbarTarget, setToolbarTarget] = useState<Element | null>(null);
  const [, setOutlineRevision] = useState(0);
  const dismissSlashMenu = useCallback(() => { slashMenuRef.current = null; setSlashMenu(null); }, []);
  useDismissablePopup(documentRef, !!slashMenu, dismissSlashMenu);

  useEffect(() => {
    if (!toolbarTargetId) { setToolbarTarget(null); return; }
    setToolbarTarget(document.getElementById(toolbarTargetId));
  }, [toolbarTargetId]);

  useEffect(() => {
    if (!outlineOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (documentRef.current?.contains(target) || toolbarTarget?.contains(target)) return;
      setOutlineOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [outlineOpen, toolbarTarget]);

  function syncSlashMenu(nextEditor: Editor) {
    const { selection } = nextEditor.state;
    if (!selection.empty) { slashMenuRef.current = null; setSlashMenu(null); return; }
    const parent = selection.$from.parent;
    const beforeCursor = parent.textContent.slice(0, selection.$from.parentOffset);
    const match = beforeCursor.match(/(?:^|\s)\/([a-z]*)$/i);
    if (!match) { slashMenuRef.current = null; setSlashMenu(null); return; }
    const from = selection.$from.pos - match[0].length + (match[0].startsWith(" ") ? 1 : 0);
    const coords = nextEditor.view.coordsAtPos(selection.from);
    const next = { from, query: match[1], x: coords.left, y: coords.bottom + 8 };
    setOutlineOpen(false);
    slashMenuRef.current = next; setSlashMenu(next); selectedCommandRef.current = 0; setSelectedCommand(0);
  }

  async function insertPastedImages(files: File[]) {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    try {
      for (const file of files) {
        const assetId = createLocalAssetId();
        await storeImageAsset(workspaceId, assetId, file);
        currentEditor.chain().focus().insertContent({ type: "image", attrs: { assetId, src: `notespace-asset://${assetId}`, alt: "Pasted image" } }).run();
      }
    } catch (error) { showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not store this image." }); }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }), createLocalImageExtension(workspaceId), TaskList, TaskItem, Highlight,
      UniqueID.configure({ types: ["paragraph", "heading", "codeBlock", "listItem", "taskItem"], attributeName: "blockId" }),
    ],
    content: initial.data,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Workspace document", role: "textbox", "aria-multiline": "true", spellcheck: "false", class: editorClassName,
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.items ?? []).filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => file !== null);
        if (files.length) { event.preventDefault(); void insertPastedImages(files); return true; }

        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!looksLikeMarkdown(text)) return false;
        const root = markdownToSnapshot(text).data as EditorJson;
        if (!root.content?.length) return false;
        event.preventDefault();
        editorRef.current?.chain().focus().insertContent(root.content).run();
        return true;
      },
      handleKeyDown: (_view, event) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        if ((event.key === "Backspace" || event.key === "Delete") && !currentEditor.state.selection.empty) { event.preventDefault(); currentEditor.commands.deleteSelection(); return true; }
        const menu = slashMenuRef.current;
        if (!menu) return false;
        const filtered = slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(menu.query.toLowerCase()));
        if (event.key === "ArrowDown") { event.preventDefault(); setSelectedCommand((value) => { const next = filtered.length ? (value + 1) % filtered.length : 0; selectedCommandRef.current = next; return next; }); return true; }
        if (event.key === "ArrowUp") { event.preventDefault(); setSelectedCommand((value) => { const next = filtered.length ? (value - 1 + filtered.length) % filtered.length : 0; selectedCommandRef.current = next; return next; }); return true; }
        if (event.key === "Escape") { event.preventDefault(); slashMenuRef.current = null; setSlashMenu(null); return true; }
        if (event.key === "Enter" && filtered.length) { event.preventDefault(); runSlashCommand(filtered[Math.min(selectedCommandRef.current, filtered.length - 1)]); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: changed }) => {
      onChange({ format: "tiptap", version: 1, data: changed.getJSON() });
      onBlockSelect?.(selectedBlockId(changed), !changed.state.selection.empty);
      syncSlashMenu(changed);
      setOutlineRevision((value) => value + 1);
    },
    onSelectionUpdate: ({ editor: changed }) => { onBlockSelect?.(selectedBlockId(changed), !changed.state.selection.empty); syncSlashMenu(changed); },
  });

  editorRef.current = editor;

  function runSlashCommand(command: SlashCommand) {
    const menu = slashMenuRef.current;
    const currentEditor = editorRef.current;
    if (!menu || !currentEditor) return;
    currentEditor.chain().focus().deleteRange({ from: menu.from, to: currentEditor.state.selection.from }).run();
    command.run(currentEditor); slashMenuRef.current = null; setSlashMenu(null);
  }

  function focusHeading(blockId: string) {
    if (!editor) return;
    const position = findBlockPosition(editor, blockId);
    if (position === null) return;
    editor.chain().focus().setTextSelection(position).scrollIntoView().run();
    setOutlineOpen(false);
  }

  async function exportMarkdown() {
    if (!editor) return;
    const snapshot: Snapshot = { format: "tiptap", version: 1, data: editor.getJSON() };
    const assetSources: Record<string, string> = {};
    let missingAssets = 0;
    await Promise.all(snapshotAssetIds(snapshot).map(async (assetId) => {
      try {
        const asset = await loadImageAsset(workspaceId, assetId);
        if (!asset) { missingAssets += 1; return; }
        assetSources[assetId] = await blobToDataUrl(asset.blob);
      } catch {
        missingAssets += 1;
      }
    }));
    const markdown = snapshotToMarkdown(snapshot, assetSources);
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "notespace-note.md";
    link.click();
    URL.revokeObjectURL(url);
    if (missingAssets > 0) showToast({ kind: "error", message: `Exported note, but ${missingAssets} image${missingAssets === 1 ? "" : "s"} could not be embedded.` });
  }

  useEffect(() => {
    if (!editor || !focusRequest) return;
    const position = findBlockPosition(editor, focusRequest.id);
    if (position === null) return;
    editor.chain().focus().setTextSelection(position).scrollIntoView().run();
  }, [editor, focusRequest]);

  useEffect(() => {
    if (!editor || highlightRequest === null) return;
    if (editor.state.selection.empty) return;
    editor.chain().focus().toggleHighlight().run();
  }, [editor, highlightRequest]);

  if (!editor) return <div className="grid flex-1 place-items-center p-10 text-center text-xs text-muted" role="status">Opening document…</div>;

  const filteredCommands = slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes((slashMenu?.query ?? "").toLowerCase()));
  const outline = outlineOpen ? outlineItems(editor) : [];
  const toolbarButtons = <>
    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Export note as Markdown" onClick={() => void exportMarkdown()}>
      <Download size={14} aria-hidden="true" />
    </button>
    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Open note outline" aria-expanded={outlineOpen} onClick={() => { dismissSlashMenu(); setOutlineOpen((value) => !value); }}>
      <ListTree size={14} aria-hidden="true" />
    </button>
  </>;

  return (
    <div ref={documentRef} className="relative h-auto max-h-none min-h-0 w-full flex-1 overflow-hidden">
      {toolbarTarget ? createPortal(<div className="flex items-center gap-0.5">{toolbarButtons}</div>, toolbarTarget) : !toolbarTargetId ? (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-md border border-line bg-surface/90 p-0.5 opacity-70 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus-within:opacity-100">{toolbarButtons}</div>
      ) : null}
      {outlineOpen && (
        <nav className={cn("absolute right-3 z-20 max-h-[min(360px,60vh)] w-[min(260px,calc(100%_-_24px))] overflow-auto rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_#0002]", toolbarTarget ? "top-2" : "top-12")} aria-label="Note outline">
          <div className="px-2 py-1.5 text-[10px] font-medium text-muted">Outline</div>
          {outline.length ? outline.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full truncate rounded px-2 py-1.5 text-left text-[11px] text-ink hover:bg-tint"
              style={{ paddingLeft: `${8 + Math.max(0, item.level - 1) * 10}px` }}
              onClick={() => focusHeading(item.id)}
            >
              {item.text}
            </button>
          )) : <p className="m-0 px-2 py-3 text-[10px] leading-4 text-muted">Add headings to navigate long notes.</p>}
        </nav>
      )}
      <EditorContent editor={editor} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" />
      {slashMenu && filteredCommands.length > 0 && (
        <div className="fixed z-30 max-h-[min(330px,calc(100vh_-_24px))] w-[220px] overflow-auto rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_#0002]" role="listbox" aria-label="Insert block" style={{ left: slashMenu.x, top: slashMenu.y }}>
          <div className="px-[9px] pt-1.5 pb-[5px] text-[10px] font-medium text-muted">Insert block</div>
          {filteredCommands.map((command, index) => (
            <button key={command.label} type="button" role="option" aria-selected={index === selectedCommand} className="grid w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-[7px] rounded-[5px] border-0 bg-transparent px-[9px] py-2 text-left text-ink hover:bg-tint aria-selected:bg-tint" onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault()} onClick={() => runSlashCommand(command)}>
              <span className="grid place-items-center text-accent"><command.icon size={15} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="flex min-w-0 flex-col gap-0.5"><span className="text-[11px] font-medium">{command.label}</span><span className="text-[10px] text-muted">{command.description}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
