import type { Editor } from "@tiptap/core";
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import UniqueID from "@tiptap/extension-unique-id";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Code2, Heading2, List, ListChecks, ListOrdered, Minus, Quote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Snapshot } from "../../domain/project/project";
import { cn } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";
import { createLocalAssetId, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";

type FocusRequest = { id: string; request: number } | null;
type HighlightRequest = number | null;

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

type SlashCommand = { label: string; description: string; keywords: string; icon: LucideIcon; run: (editor: Editor) => void };

const slashCommands: SlashCommand[] = [
  { label: "Heading", description: "Large section heading", keywords: "heading h2", icon: Heading2, run: (editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
  { label: "Bullet list", description: "Turn this into a list", keywords: "bullet list ul", icon: List, run: (editor) => { editor.chain().focus().toggleBulletList().run(); } },
  { label: "Numbered list", description: "Create an ordered list", keywords: "numbered ordered list ol", icon: ListOrdered, run: (editor) => { editor.chain().focus().toggleOrderedList().run(); } },
  { label: "Quote", description: "Highlight a passage", keywords: "quote blockquote", icon: Quote, run: (editor) => { editor.chain().focus().toggleBlockquote().run(); } },
  { label: "Code block", description: "Write formatted code", keywords: "code pre", icon: Code2, run: (editor) => { editor.chain().focus().toggleCodeBlock().run(); } },
  { label: "Divider", description: "Add a horizontal rule", keywords: "divider rule line", icon: Minus, run: (editor) => { editor.chain().focus().setHorizontalRule().run(); } },
  { label: "Checklist", description: "Track tasks inline", keywords: "check task todo", icon: ListChecks, run: (editor) => { editor.chain().focus().toggleWrap("taskList").run(); } },
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
      {src ? <img className="block h-auto max-w-full rounded-lg border border-line" src={src} alt={node.attrs.alt || "Pasted image"} draggable={false} /> : <span className="block rounded-lg border border-dashed border-line p-3 text-[11px] text-muted">Image is stored locally on this device.</span>}
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

export default function DocumentEditor({ initial, onChange, onBlockSelect, focusRequest, highlightRequest = null, workspaceId }: { initial: Snapshot; onChange: (snapshot: Snapshot) => void; onBlockSelect?: (blockId: string | null, hasTextSelection: boolean) => void; focusRequest?: FocusRequest; highlightRequest?: HighlightRequest; workspaceId: string }) {
  const { showToast } = useToast();
  const slashMenuRef = useRef<SlashMenu>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const selectedCommandRef = useRef(0);
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(null);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const dismissSlashMenu = useCallback(() => { slashMenuRef.current = null; setSlashMenu(null); }, []);
  useDismissablePopup(documentRef, !!slashMenu, dismissSlashMenu);

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
    } catch (error) { showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not store this image locally." }); }
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
        if (!files.length) return false;
        event.preventDefault(); void insertPastedImages(files); return true;
      },
      handleKeyDown: (_view, event) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") { event.preventDefault(); currentEditor.commands.selectAll(); return true; }
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
    onUpdate: ({ editor: changed }) => { onChange({ format: "tiptap", version: 1, data: changed.getJSON() }); onBlockSelect?.(selectedBlockId(changed), !changed.state.selection.empty); syncSlashMenu(changed); },
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
  return (
    <div ref={documentRef} className="h-auto max-h-none min-h-0 w-full flex-1 overflow-hidden">
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
