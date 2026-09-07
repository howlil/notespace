import type { Editor, JSONContent } from "@tiptap/core";
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import FindAndReplace from "@tiptap/extension-find-and-replace";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import UniqueID from "@tiptap/extension-unique-id";
import "katex/dist/katex.min.css";
import { common, createLowlight } from "lowlight";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  CaseSensitive,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Plus,
  Quote,
  Search,
  Sigma,
  Strikethrough,
  Table2,
  Trash2,
  Unlink,
  WrapText,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Snapshot } from "../../domain/project/project";
import { looksLikeMarkdown, markdownToSnapshot, snapshotAssetIds, snapshotToMarkdown } from "../../domain/document/markdown";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  cn,
} from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";
import { blobToDataUrl, createLocalAssetId, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";
import { placeEditorPopup } from "./editor-floating";

type FocusRequest = { id: string; request: number } | null;
type HighlightRequest = number | null;
type OutlineItem = { id: string; level: number; text: string };
type EditorJson = { type?: string; content?: JSONContent[] };
type PopupPosition = ReturnType<typeof placeEditorPopup>;
type SlashMenu = { from: number; query: string } & PopupPosition;
type SelectionMenu = PopupPosition | null;
type MathEdit = { kind: "inline" | "block"; pos: number; latex: string } | null;
type FindStorage = {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
  results: Array<{ from: number; to: number }>;
  currentIndex: number | null;
};

const lowlight = createLowlight(common);

function hasStructuredClipboardHtml(html: string) {
  return /<(?:table|thead|tbody|tr|th|td|h[1-6]|blockquote|ul|ol)\b/i.test(html);
}

const editorClassName = cn(
  "h-full min-h-[350px] flex-1 overflow-x-hidden overflow-y-auto px-[30px] pt-[27px] pb-20 text-sm leading-[1.9] outline-none [overflow-wrap:anywhere] [scrollbar-width:none] [-ms-overflow-style:none]",
  "[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0",
  "[&>*+*]:mt-3 [&_p]:my-2",
  "[&_mark]:rounded-sm [&_mark]:bg-[color-mix(in_srgb,var(--accent)_32%,transparent)] [&_mark]:px-0.5 [&_mark]:text-inherit",
  "[&_.find-and-replace-result]:rounded-sm [&_.find-and-replace-result]:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] [&_.find-and-replace-result-current]:bg-[color-mix(in_srgb,var(--accent)_38%,transparent)]",
  "[&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:float-left [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:h-0 [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:pointer-events-none [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:text-muted [&>p:only-child:has(>br.ProseMirror-trailingBreak:only-child)::before]:content-['Start_writing...']",
  "[&_h1]:mt-7 [&_h1]:text-[27px] [&_h2]:mt-[25px] [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:leading-[1.4] [&_h2]:tracking-[-.5px] [&_h2]:text-ink [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-ink [&_h4]:font-medium [&_h4]:text-ink [&_h5]:font-medium [&_h5]:text-ink [&_h6]:font-medium [&_h6]:text-muted",
  "[&_ul]:list-disc [&_ul]:pl-[23px] [&_ol]:list-decimal [&_ol]:pl-[23px]",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0",
  "[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2",
  "[&_li[data-type=taskItem]>label]:mt-[7px] [&_li[data-type=taskItem]>label]:grid [&_li[data-type=taskItem]>label]:size-4 [&_li[data-type=taskItem]>label]:shrink-0 [&_li[data-type=taskItem]>label]:place-items-center",
  "[&_li[data-type=taskItem]_input]:size-3.5 [&_li[data-type=taskItem]_input]:cursor-pointer [&_li[data-type=taskItem]_input]:accent-[var(--accent)]",
  "[&_li[data-type=taskItem]>div]:min-w-0 [&_li[data-type=taskItem]>div]:flex-1 [&_li[data-type=taskItem][data-checked=true]>div]:text-muted [&_li[data-type=taskItem][data-checked=true]>div]:line-through",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-line [&_th]:bg-tint [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-line [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_table_p]:my-0",
  "[&_pre]:overflow-auto [&_pre]:whitespace-pre [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-background [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-[1.7]",
  "[&_code]:rounded-[3px] [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[.88em] [&_pre_code]:p-0",
  "[&_.hljs-comment]:text-muted [&_.hljs-quote]:text-muted [&_.hljs-keyword]:text-accent [&_.hljs-selector-tag]:text-accent [&_.hljs-number]:text-accent [&_.hljs-string]:text-muted [&_.hljs-title]:font-medium [&_.hljs-built_in]:text-accent",
  "[&_.tiptap-mathematics-render]:cursor-pointer [&_.tiptap-mathematics-render]:rounded-md [&_.tiptap-mathematics-render]:px-1 [&_.tiptap-mathematics-render]:py-0.5 [&_.tiptap-mathematics-render:hover]:bg-tint",
  "[&_a]:text-accent [&_a]:underline [&_blockquote]:border-0 [&_blockquote]:pl-0 [&_blockquote]:text-muted",
  "max-[1150px]:px-[22px] max-[1150px]:pt-[25px] max-[1150px]:pb-[60px] max-[800px]:px-[18px] max-[800px]:pt-[22px] max-[800px]:pb-[70px]",
);

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

function activeCodeText(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "codeBlock") return node.textContent;
  }
  return "";
}

type SlashCommand = {
  label: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
};

function LocalImageView({ node, workspaceId, updateAttributes, deleteNode, selected }: NodeViewProps & { workspaceId: string }) {
  const assetId = typeof node.attrs.assetId === "string" ? node.attrs.assetId : "";
  const fallbackSrc = typeof node.attrs.src === "string" && !node.attrs.src.startsWith("notespace-asset:") ? node.attrs.src : null;
  const [src, setSrc] = useState<string | null>(fallbackSrc);
  const [editingAlt, setEditingAlt] = useState(false);
  const [alt, setAlt] = useState(typeof node.attrs.alt === "string" ? node.attrs.alt : "");

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

  function commitAlt() {
    updateAttributes({ alt: alt.trim() || "Pasted image" });
    setEditingAlt(false);
  }

  return (
    <NodeViewWrapper className="group relative my-3.5 block max-w-full">
      <motion.div layout className={cn("relative inline-block max-w-full rounded-lg", selected && "ring-2 ring-accent/40")}>
        {src ? (
          <img className="block h-auto max-w-full rounded-lg border border-line" src={src} alt={node.attrs.alt || "Pasted image"} draggable={false} />
        ) : (
          <span className="block rounded-lg border border-dashed border-line p-3 text-[11px] text-muted">Image could not be loaded.</span>
        )}
        <div className="absolute right-2 top-2 flex gap-1 rounded-md border border-line bg-surface/92 p-1 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" onClick={() => setEditingAlt(true)}>Alt</button>
          <button type="button" className="grid size-6 place-items-center rounded text-muted hover:bg-tint hover:text-danger" aria-label="Remove image" onClick={deleteNode}><Trash2 size={12} /></button>
        </div>
      </motion.div>
      <AnimatePresence initial={false}>
        {editingAlt && (
          <motion.form
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 flex max-w-sm gap-1.5"
            onSubmit={(event) => { event.preventDefault(); commitAlt(); }}
          >
            <input value={alt} onChange={(event) => setAlt(event.target.value)} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] outline-none focus:border-accent" aria-label="Image alt text" autoFocus />
            <Button type="submit" size="sm">Save</Button>
          </motion.form>
        )}
      </AnimatePresence>
    </NodeViewWrapper>
  );
}

function createLocalImageExtension(workspaceId: string) {
  return TiptapNode.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        assetId: { default: null },
        src: { default: null },
        alt: { default: "Pasted image" },
      };
    },
    parseHTML() { return [{ tag: "img[src]" }]; },
    renderHTML({ HTMLAttributes }) {
      const attributes = { ...HTMLAttributes };
      delete attributes.assetId;
      return ["img", mergeAttributes(attributes)];
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => <LocalImageView {...props} workspaceId={workspaceId} />);
    },
  });
}

function MenuButton({
  active = false,
  label,
  children,
  onMouseDown,
}: {
  active?: boolean;
  label: string;
  children: ReactNode;
  onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink aria-pressed:bg-tint aria-pressed:text-accent"
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  );
}

export default function DocumentEditor({
  initial,
  onChange,
  onBlockSelect,
  focusRequest,
  highlightRequest = null,
  workspaceId,
  toolbarTargetId,
}: {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  onBlockSelect?: (blockId: string | null, hasTextSelection: boolean) => void;
  focusRequest?: FocusRequest;
  highlightRequest?: HighlightRequest;
  workspaceId: string;
  toolbarTargetId?: string;
}) {
  const { showToast } = useToast();
  const documentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const slashMenuRef = useRef<SlashMenu | null>(null);
  const selectedCommandRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  const [slashMenu, setSlashMenu] = useState<SlashMenu | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu>(null);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [toolbarTarget, setToolbarTarget] = useState<Element | null>(null);
  const [, setOutlineRevision] = useState(0);
  const [, setFindRevision] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [codeWrap, setCodeWrap] = useState(false);
  const [mathEdit, setMathEdit] = useState<MathEdit>(null);
  const [mathValue, setMathValue] = useState("");

  const dismissSlashMenu = useCallback(() => {
    slashMenuRef.current = null;
    setSlashMenu(null);
  }, []);
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

  useEffect(() => {
    if (!findOpen) return;
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [findOpen]);

  function syncSlashMenu(nextEditor: Editor) {
    const { selection } = nextEditor.state;
    if (!selection.empty) { slashMenuRef.current = null; setSlashMenu(null); return; }
    const parent = selection.$from.parent;
    const beforeCursor = parent.textContent.slice(0, selection.$from.parentOffset);
    const match = beforeCursor.match(/(?:^|\s)\/([a-z]*)$/i);
    if (!match) { slashMenuRef.current = null; setSlashMenu(null); return; }
    const from = selection.$from.pos - match[0].length + (match[0].startsWith(" ") ? 1 : 0);
    const coords = nextEditor.view.coordsAtPos(selection.from);
    const filteredCount = slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(match[1].toLowerCase())).length;
    const popupHeight = Math.min(330, 36 + Math.max(1, filteredCount) * 43);
    const position = placeEditorPopup(
      { left: coords.left, top: coords.top, bottom: coords.bottom },
      { width: 220, height: popupHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { prefer: "bottom" },
    );
    const next = { from, query: match[1], ...position };
    setOutlineOpen(false);
    setSelectionMenu(null);
    slashMenuRef.current = next;
    setSlashMenu(next);
    selectedCommandRef.current = 0;
    setSelectedCommand(0);
  }

  function syncSelectionMenu(nextEditor: Editor) {
    const { selection } = nextEditor.state;
    if (selection.empty || !nextEditor.state.doc.textBetween(selection.from, selection.to, " ").trim()) {
      setSelectionMenu(null);
      setLinkEditing(false);
      return;
    }
    const start = nextEditor.view.coordsAtPos(selection.from);
    const end = nextEditor.view.coordsAtPos(selection.to);
    const center = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2;
    const position = placeEditorPopup(
      { left: center - 156, top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom) },
      { width: 312, height: linkEditing ? 82 : 38 },
      { width: window.innerWidth, height: window.innerHeight },
      { prefer: "top", gap: 7 },
    );
    setSelectionMenu(position);
  }

  async function insertImages(files: File[], position?: number) {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    try {
      let at = position;
      for (const file of files) {
        const assetId = createLocalAssetId();
        await storeImageAsset(workspaceId, assetId, file);
        const node = { type: "image", attrs: { assetId, src: `notespace-asset://${assetId}`, alt: file.name || "Pasted image" } };
        if (typeof at === "number") {
          currentEditor.chain().focus().insertContentAt(at, node).run();
          at += 1;
        } else {
          currentEditor.chain().focus().insertContent(node).run();
        }
      }
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not store this image." });
    }
  }

  const slashCommands: SlashCommand[] = [
    { label: "Heading", description: "Large section heading", keywords: "heading h2", icon: Heading2, run: (editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
    { label: "Bullet list", description: "Turn this into a list", keywords: "bullet list ul", icon: List, run: (editor) => { editor.chain().focus().toggleBulletList().run(); } },
    { label: "Numbered list", description: "Create an ordered list", keywords: "numbered ordered list ol", icon: ListOrdered, run: (editor) => { editor.chain().focus().toggleOrderedList().run(); } },
    { label: "Checklist", description: "Interactive task list", keywords: "task todo checkbox checklist", icon: CheckSquare, run: (editor) => { editor.chain().focus().toggleTaskList().run(); } },
    { label: "Table", description: "Insert a 3 × 3 comparison table", keywords: "table grid compare", icon: Table2, run: (editor) => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
    { label: "Quote", description: "Highlight a passage", keywords: "quote blockquote", icon: Quote, run: (editor) => { editor.chain().focus().toggleBlockquote().run(); } },
    { label: "Code block", description: "Syntax-highlighted code", keywords: "code pre source", icon: Code2, run: (editor) => { editor.chain().focus().toggleCodeBlock().run(); } },
    { label: "Inline math", description: "Insert a compact equation", keywords: "math equation latex inline", icon: Sigma, run: (editor) => { editor.chain().focus().insertInlineMath({ latex: "x^2" }).run(); } },
    { label: "Math block", description: "Insert a display equation", keywords: "math equation latex block", icon: Sigma, run: (editor) => { editor.chain().focus().insertBlockMath({ latex: "\\\\frac{a}{b}" }).run(); } },
    { label: "Image", description: "Choose an image from this device", keywords: "image photo upload", icon: ImagePlus, run: () => { imageInputRef.current?.click(); } },
    { label: "Divider", description: "Add a horizontal rule", keywords: "divider rule line", icon: Minus, run: (editor) => { editor.chain().focus().setHorizontalRule().run(); } },
  ];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight, enableTabIndentation: true, tabSize: 2 }),
      createLocalImageExtension(workspaceId),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: { checkboxLabel: (_node, checked) => checked ? "Mark task incomplete" : "Mark task complete" },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Mathematics.configure({
        inlineOptions: {
          onClick: (node, pos) => {
            const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : "";
            setMathEdit({ kind: "inline", pos, latex });
            setMathValue(latex);
          },
        },
        blockOptions: {
          onClick: (node, pos) => {
            const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : "";
            setMathEdit({ kind: "block", pos, latex });
            setMathValue(latex);
          },
        },
        katexOptions: { throwOnError: false },
      }),
      FindAndReplace.configure({ injectCSS: false, searchDebounceMs: 100 }),
      Highlight,
      UniqueID.configure({ types: ["paragraph", "heading", "codeBlock", "listItem", "taskItem"], attributeName: "blockId" }),
    ],
    content: initial.data,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Workspace document",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
        class: cn(editorClassName, codeWrap && "[&_pre]:whitespace-pre-wrap [&_pre]:break-words"),
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;
        const files = Array.from(clipboard?.items ?? [])
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (files.length) { event.preventDefault(); void insertImages(files); return true; }

        const html = clipboard?.getData("text/html") ?? "";
        if (hasStructuredClipboardHtml(html)) return false;

        const text = clipboard?.getData("text/plain") ?? "";
        if (!looksLikeMarkdown(text)) return false;
        const root = markdownToSnapshot(text).data as EditorJson;
        if (!root.content?.length) return false;
        event.preventDefault();
        editorRef.current?.chain().focus().insertContent(root.content).run();
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(files, position);
        return true;
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof Element)) return false;
        const anchor = target.closest("a[href]");
        if (!anchor) return false;
        event.preventDefault();
        const currentEditor = editorRef.current;
        if (!currentEditor) return true;
        currentEditor.chain().focus().extendMarkRange("link").run();
        setLinkUrl(anchor.getAttribute("href") ?? "");
        setLinkEditing(true);
        syncSelectionMenu(currentEditor);
        return true;
      },
      handleKeyDown: (_view, event) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setFindOpen(true);
          dismissSlashMenu();
          setSelectionMenu(null);
          return true;
        }
        if ((event.key === "Backspace" || event.key === "Delete") && !currentEditor.state.selection.empty) {
          event.preventDefault();
          currentEditor.commands.deleteSelection();
          return true;
        }
        const menu = slashMenuRef.current;
        if (!menu) return false;
        const filtered = slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(menu.query.toLowerCase()));
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedCommand((value) => {
            const next = filtered.length ? (value + 1) % filtered.length : 0;
            selectedCommandRef.current = next;
            return next;
          });
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedCommand((value) => {
            const next = filtered.length ? (value - 1 + filtered.length) % filtered.length : 0;
            selectedCommandRef.current = next;
            return next;
          });
          return true;
        }
        if (event.key === "Escape") { event.preventDefault(); dismissSlashMenu(); return true; }
        if (event.key === "Enter" && filtered.length) {
          event.preventDefault();
          runSlashCommand(filtered[Math.min(selectedCommandRef.current, filtered.length - 1)]);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: changed }) => {
      onChange({ format: "tiptap", version: 1, data: changed.getJSON() });
      onBlockSelect?.(selectedBlockId(changed), !changed.state.selection.empty);
      syncSlashMenu(changed);
      syncSelectionMenu(changed);
      setOutlineRevision((value) => value + 1);
    },
    onSelectionUpdate: ({ editor: changed }) => {
      onBlockSelect?.(selectedBlockId(changed), !changed.state.selection.empty);
      syncSlashMenu(changed);
      syncSelectionMenu(changed);
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor || !findOpen) return;
    const onTransaction = () => setFindRevision((value) => value + 1);
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor, findOpen]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...editor.options.editorProps.attributes,
          class: cn(editorClassName, codeWrap && "[&_pre]:whitespace-pre-wrap [&_pre]:break-words"),
        },
      },
    });
  }, [codeWrap, editor]);

  function runSlashCommand(command: SlashCommand) {
    const menu = slashMenuRef.current;
    const currentEditor = editorRef.current;
    if (!menu || !currentEditor) return;
    currentEditor.chain().focus().deleteRange({ from: menu.from, to: currentEditor.state.selection.from }).run();
    command.run(currentEditor);
    dismissSlashMenu();
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

  function updateSearchTerm(value: string) {
    if (!editor) return;
    setFindTerm(value);
    editor.commands.setSearchTerm(value);
  }

  function updateReplaceTerm(value: string) {
    if (!editor) return;
    setReplaceTerm(value);
    editor.commands.setReplaceTerm(value);
  }

  function closeFind() {
    if (editor) editor.commands.clearSearch();
    setFindOpen(false);
  }

  function applyLink() {
    if (!editor) return;
    const href = linkUrl.trim();
    if (href) editor.chain().focus().setLink({ href }).run();
    else editor.chain().focus().unsetLink().run();
    setLinkEditing(false);
    syncSelectionMenu(editor);
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ kind: "success", message: success });
    } catch {
      showToast({ kind: "error", message: "Could not copy to clipboard." });
    }
  }

  function saveMath() {
    if (!editor || !mathEdit) return;
    const latex = mathValue.trim();
    if (!latex) {
      if (mathEdit.kind === "inline") editor.commands.deleteInlineMath({ pos: mathEdit.pos });
      else editor.commands.deleteBlockMath({ pos: mathEdit.pos });
    } else if (mathEdit.kind === "inline") {
      editor.commands.updateInlineMath({ latex, pos: mathEdit.pos });
    } else {
      editor.commands.updateBlockMath({ latex, pos: mathEdit.pos });
    }
    setMathEdit(null);
    editor.chain().focus().run();
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
  const findStorage = editor.storage.findAndReplace as FindStorage;
  const findTotal = findStorage.results.length;
  const findCurrent = findStorage.currentIndex === null ? 0 : findStorage.currentIndex + 1;
  const tableActive = editor.isActive("table");
  const codeActive = editor.isActive("codeBlock");
  const codeLanguage = typeof editor.getAttributes("codeBlock").language === "string" ? editor.getAttributes("codeBlock").language : "";
  const codeLanguages = lowlight.listLanguages().sort();

  const toolbarButtons = <>
    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Find in note" aria-expanded={findOpen} onClick={() => { dismissSlashMenu(); setFindOpen((value) => !value); }}>
      <Search size={14} aria-hidden="true" />
    </button>
    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Insert image" onClick={() => imageInputRef.current?.click()}>
      <ImagePlus size={14} aria-hidden="true" />
    </button>
    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Export note as Markdown" onClick={() => void exportMarkdown()}>
      <Download size={14} aria-hidden="true" />
    </button>
    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Open note outline" aria-expanded={outlineOpen} onClick={() => { dismissSlashMenu(); setOutlineOpen((value) => !value); }}>
      <ListTree size={14} aria-hidden="true" />
    </button>
  </>;

  return (
    <div ref={documentRef} className="relative h-auto max-h-none min-h-0 w-full flex-1 overflow-hidden">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void insertImages(files);
          event.target.value = "";
        }}
      />

      {toolbarTarget ? createPortal(<div className="flex items-center gap-0.5">{toolbarButtons}</div>, toolbarTarget) : !toolbarTargetId ? (
        <motion.div layout className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-md border border-line bg-surface/90 p-0.5 opacity-70 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 focus-within:opacity-100">
          {toolbarButtons}
        </motion.div>
      ) : null}

      <AnimatePresence initial={false}>
        {findOpen && (
          <motion.section
            key="find-replace"
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className={cn(
              "absolute right-3 top-3 z-30 w-[min(330px,calc(100%_-_24px))] rounded-lg border border-line bg-surface p-2 shadow-[0_12px_32px_#0002]",
              toolbarTarget && "top-2",
            )}
            role="dialog"
            aria-label="Find and replace"
          >
            <div className="flex items-center gap-1.5">
              <Search size={13} className="shrink-0 text-muted" />
              <input
                ref={findInputRef}
                value={findTerm}
                onChange={(event) => updateSearchTerm(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[11px] text-ink outline-none placeholder:text-muted"
                placeholder="Find in this note"
                aria-label="Find"
              />
              <span className="min-w-10 text-right text-[10px] tabular-nums text-muted" aria-live="polite">{findCurrent} / {findTotal}</span>
              <button type="button" className="grid size-6 place-items-center rounded text-muted hover:bg-tint hover:text-ink disabled:opacity-40" aria-label="Previous result" disabled={!findTotal} onClick={() => editor.commands.goToPreviousResult()}><ChevronUp size={13} /></button>
              <button type="button" className="grid size-6 place-items-center rounded text-muted hover:bg-tint hover:text-ink disabled:opacity-40" aria-label="Next result" disabled={!findTotal} onClick={() => editor.commands.goToNextResult()}><ChevronDown size={13} /></button>
              <button type="button" className="grid size-6 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Close find and replace" onClick={closeFind}><X size={13} /></button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5">
              <input
                value={replaceTerm}
                onChange={(event) => updateReplaceTerm(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-line bg-background px-2 py-1 text-[10px] text-ink outline-none focus:border-accent"
                placeholder="Replace with"
                aria-label="Replace with"
              />
              <button
                type="button"
                aria-pressed={findStorage.caseSensitive}
                className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink aria-pressed:bg-tint aria-pressed:text-accent"
                aria-label="Match case"
                onClick={() => editor.commands.setCaseSensitive(!findStorage.caseSensitive)}
              >
                <CaseSensitive size={14} />
              </button>
              <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink disabled:opacity-40" disabled={!findTotal} onClick={() => editor.commands.replace()}>Replace</button>
              <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink disabled:opacity-40" disabled={!findTotal} onClick={() => editor.commands.replaceAll()}>All</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {outlineOpen && (
          <motion.nav
            key="outline"
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className={cn("absolute right-3 z-20 max-h-[min(360px,60vh)] w-[min(260px,calc(100%_-_24px))] overflow-auto rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_#0002]", toolbarTarget ? "top-2" : "top-12")}
            aria-label="Note outline"
          >
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
          </motion.nav>
        )}
      </AnimatePresence>

      <EditorContent editor={editor} className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" />

      <AnimatePresence initial={false}>
        {selectionMenu && (
          <motion.div
            key="selection-toolbar"
            initial={{ opacity: 0, y: selectionMenu.placement === "top" ? 5 : -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="fixed z-40 min-w-[250px] rounded-lg border border-line bg-surface p-1 shadow-[0_10px_28px_#0002]"
            style={{ left: selectionMenu.x, top: selectionMenu.y }}
          >
            {!linkEditing ? (
              <div className="flex items-center gap-0.5">
                <MenuButton label="Bold" active={editor.isActive("bold")} onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().toggleBold().run(); }}><Bold size={14} /></MenuButton>
                <MenuButton label="Italic" active={editor.isActive("italic")} onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().toggleItalic().run(); }}><Italic size={14} /></MenuButton>
                <MenuButton label="Strikethrough" active={editor.isActive("strike")} onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().toggleStrike().run(); }}><Strikethrough size={14} /></MenuButton>
                <MenuButton label="Inline code" active={editor.isActive("code")} onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().toggleCode().run(); }}><Code2 size={14} /></MenuButton>
                <MenuButton label="Highlight" active={editor.isActive("highlight")} onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().toggleHighlight().run(); }}><Highlighter size={14} /></MenuButton>
                <span className="mx-0.5 h-4 w-px bg-line" />
                <MenuButton label="Edit link" active={editor.isActive("link")} onMouseDown={(event) => {
                  event.preventDefault();
                  setLinkUrl(typeof editor.getAttributes("link").href === "string" ? editor.getAttributes("link").href : "");
                  setLinkEditing(true);
                  syncSelectionMenu(editor);
                }}><Link2 size={14} /></MenuButton>
              </div>
            ) : (
              <form className="flex min-w-[300px] items-center gap-1" onSubmit={(event) => { event.preventDefault(); applyLink(); }}>
                <Link2 size={13} className="ml-1 shrink-0 text-muted" />
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-1 text-[11px] text-ink outline-none placeholder:text-muted"
                  placeholder="https://…"
                  aria-label="Link URL"
                  autoFocus
                />
                {linkUrl && (
                  <>
                    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Open link" onMouseDown={(event) => event.preventDefault()} onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={13} /></button>
                    <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Copy link" onMouseDown={(event) => event.preventDefault()} onClick={() => void copyText(linkUrl, "Link copied.")}><Copy size={13} /></button>
                  </>
                )}
                {editor.isActive("link") && <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-danger" aria-label="Remove link" onMouseDown={(event) => { event.preventDefault(); editor.chain().focus().unsetLink().run(); setLinkEditing(false); }}><Unlink size={13} /></button>}
                <button type="submit" className="grid size-7 place-items-center rounded text-accent hover:bg-tint" aria-label="Apply link"><Check size={13} /></button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {slashMenu && filteredCommands.length > 0 && (
          <motion.div
            key="slash-menu"
            initial={{ opacity: 0, y: slashMenu.placement === "top" ? 6 : -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="fixed z-30 max-h-[min(330px,calc(100vh_-_24px))] w-[220px] overflow-auto rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_#0002]"
            role="listbox"
            aria-label="Insert block"
            data-placement={slashMenu.placement}
            style={{ left: slashMenu.x, top: slashMenu.y }}
          >
            <div className="px-[9px] pt-1.5 pb-[5px] text-[10px] font-medium text-muted">Insert block</div>
            {filteredCommands.map((command, index) => (
              <button
                key={command.label}
                type="button"
                role="option"
                aria-selected={index === selectedCommand}
                className="grid w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-[7px] rounded-[5px] border-0 bg-transparent px-[9px] py-2 text-left text-ink hover:bg-tint aria-selected:bg-tint"
                onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault()}
                onClick={() => runSlashCommand(command)}
              >
                <span className="grid place-items-center text-accent"><command.icon size={15} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="flex min-w-0 flex-col gap-0.5"><span className="text-[11px] font-medium">{command.label}</span><span className="text-[10px] text-muted">{command.description}</span></span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {(tableActive || codeActive) && (
          <motion.div
            key={tableActive ? "table-tools" : "code-tools"}
            initial={{ opacity: 0, y: 6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.985 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface/95 p-1 shadow-[0_10px_28px_#0002] backdrop-blur"
            aria-label={tableActive ? "Table tools" : "Code block tools"}
          >
            {tableActive ? (
              <>
                <button type="button" className="whitespace-nowrap rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" onClick={() => editor.chain().focus().addRowAfter().run()}><Plus size={11} className="mr-1 inline" />Row</button>
                <button type="button" className="whitespace-nowrap rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</button>
                <button type="button" className="whitespace-nowrap rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" onClick={() => editor.chain().focus().addColumnAfter().run()}><Plus size={11} className="mr-1 inline" />Column</button>
                <button type="button" className="whitespace-nowrap rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" onClick={() => editor.chain().focus().deleteColumn().run()}>− Column</button>
                <span className="h-4 w-px bg-line" />
                <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-danger" aria-label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={13} /></button>
              </>
            ) : (
              <>
                <select
                  value={codeLanguage}
                  onChange={(event) => editor.chain().focus().updateAttributes("codeBlock", { language: event.target.value || null }).run()}
                  className="max-w-32 rounded border border-line bg-surface px-2 py-1 text-[10px] text-ink outline-none focus:border-accent"
                  aria-label="Code language"
                >
                  <option value="">Auto detect</option>
                  {codeLanguages.map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
                <button type="button" aria-pressed={codeWrap} className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink aria-pressed:bg-tint aria-pressed:text-accent" aria-label="Toggle code wrapping" onClick={() => setCodeWrap((value) => !value)}><WrapText size={13} /></button>
                <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-tint hover:text-ink" aria-label="Copy code block" onClick={() => void copyText(activeCodeText(editor), "Code copied.")}><Copy size={13} /></button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={!!mathEdit} onOpenChange={(open) => { if (!open) setMathEdit(null); }}>
        <DialogContent>
          <DialogTitle>{mathEdit?.kind === "block" ? "Edit math block" : "Edit inline math"}</DialogTitle>
          <DialogDescription>Enter LaTeX. The expression is rendered with KaTeX and remains part of the note snapshot.</DialogDescription>
          <textarea
            value={mathValue}
            onChange={(event) => setMathValue(event.target.value)}
            className="mt-4 min-h-24 w-full resize-y rounded-lg border border-line bg-background p-3 font-mono text-xs text-ink outline-none focus:border-accent"
            aria-label="LaTeX expression"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMathEdit(null)}>Cancel</Button>
            <Button type="button" onClick={saveMath}>{mathValue.trim() ? "Save equation" : "Delete equation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
