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
import { useDismissablePopup } from "../../components/ui/dismissable";
import { createLocalAssetId, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";
import "./document-editor.css";

type FocusRequest = { id: string; request: number } | null;
type HighlightRequest = number | null;

const TaskList = TiptapNode.create({
  name: "taskList",
  group: "block",
  content: "taskItem+",
  parseHTML() {
    return [{ tag: 'ul[data-type="taskList"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["ul", mergeAttributes(HTMLAttributes, { "data-type": "taskList" }), 0];
  },
});

const TaskItem = TiptapNode.create({
  name: "taskItem",
  content: "paragraph block*",
  defining: true,
  parseHTML() {
    return [{ tag: 'li[data-type="taskItem"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes, { "data-type": "taskItem" }), 0];
  },
});

function findBlockPosition(editor: Editor, blockId: string) {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.blockId === blockId) {
      position = pos + 1;
      return false;
    }
    return true;
  });
  return position;
}

function selectedBlockId(editor: Editor) {
  const blockId = editor.state.selection.$from.parent.attrs.blockId;
  return typeof blockId === "string" ? blockId : null;
}

type SlashCommand = {
  label: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
};

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
    if (!assetId) {
      setSrc(fallbackSrc);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    setSrc(null);
    void loadImageAsset(workspaceId, assetId).then((asset) => {
      if (!active || !asset) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setSrc(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, fallbackSrc, workspaceId]);

  return (
    <NodeViewWrapper className="document-image-node">
      {src ? <img src={src} alt={node.attrs.alt || "Pasted image"} draggable={false} /> : <span className="document-image-missing">Image is stored locally on this device.</span>}
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
    parseHTML() {
      return [{ tag: "img[src]" }];
    },
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

export default function DocumentEditor({
  initial,
  onChange,
  onBlockSelect,
  focusRequest,
  highlightRequest = null,
  workspaceId,
}: {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  onBlockSelect?: (blockId: string | null, hasTextSelection: boolean) => void;
  focusRequest?: FocusRequest;
  highlightRequest?: HighlightRequest;
  workspaceId: string;
}) {
  const { showToast } = useToast();
  const slashMenuRef = useRef<SlashMenu>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const selectedCommandRef = useRef(0);
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(null);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const dismissSlashMenu = useCallback(() => {
    slashMenuRef.current = null;
    setSlashMenu(null);
  }, []);
  useDismissablePopup(documentRef, !!slashMenu, dismissSlashMenu);

  function syncSlashMenu(nextEditor: Editor) {
    const { selection } = nextEditor.state;
    if (!selection.empty) {
      slashMenuRef.current = null;
      setSlashMenu(null);
      return;
    }
    const parent = selection.$from.parent;
    const beforeCursor = parent.textContent.slice(0, selection.$from.parentOffset);
    const match = beforeCursor.match(/(?:^|\s)\/([a-z]*)$/i);
    if (!match) {
      slashMenuRef.current = null;
      setSlashMenu(null);
      return;
    }
    const from = selection.$from.pos - match[0].length + (match[0].startsWith(" ") ? 1 : 0);
    const coords = nextEditor.view.coordsAtPos(selection.from);
    const next = { from, query: match[1], x: coords.left, y: coords.bottom + 8 };
    slashMenuRef.current = next;
    setSlashMenu(next);
    selectedCommandRef.current = 0;
    setSelectedCommand(0);
  }

  async function insertPastedImages(files: File[]) {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    try {
      for (const file of files) {
        const assetId = createLocalAssetId();
        await storeImageAsset(workspaceId, assetId, file);
        currentEditor.chain().focus().insertContent({
          type: "image",
          attrs: { assetId, src: `notespace-asset://${assetId}`, alt: "Pasted image" },
        }).run();
      }
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not store this image locally." });
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      createLocalImageExtension(workspaceId),
      TaskList,
      TaskItem,
      Highlight,
      UniqueID.configure({
        types: ["paragraph", "heading", "codeBlock", "listItem", "taskItem"],
        attributeName: "blockId",
      }),
    ],
    content: initial.data,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Workspace document",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (!files.length) return false;
        event.preventDefault();
        void insertPastedImages(files);
        return true;
      },
      handleKeyDown: (_view, event) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          currentEditor.commands.selectAll();
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
        if (event.key === "Escape") {
          event.preventDefault();
          slashMenuRef.current = null;
          setSlashMenu(null);
          return true;
        }
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
    },
    onSelectionUpdate: ({ editor: changed }) => {
      onBlockSelect?.(selectedBlockId(changed), !changed.state.selection.empty);
      syncSlashMenu(changed);
    },
  });

  editorRef.current = editor;

  function runSlashCommand(command: SlashCommand) {
    const menu = slashMenuRef.current;
    const currentEditor = editorRef.current;
    if (!menu || !currentEditor) return;
    currentEditor.chain().focus().deleteRange({ from: menu.from, to: currentEditor.state.selection.from }).run();
    command.run(currentEditor);
    slashMenuRef.current = null;
    setSlashMenu(null);
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

  if (!editor) {
    return <div className="editor-loading" role="status">Opening document…</div>;
  }

  const filteredCommands = slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes((slashMenu?.query ?? "").toLowerCase()));
  return (
    <div ref={documentRef} className="document-editor">
      <EditorContent editor={editor} className="document-editor-content" />
      {slashMenu && filteredCommands.length > 0 && (
        <div className="slash-menu" role="listbox" aria-label="Insert block" style={{ left: slashMenu.x, top: slashMenu.y }}>
          <div className="slash-menu-label">Insert block</div>
          {filteredCommands.map((command, index) => (
            <button
              key={command.label}
              type="button"
              role="option"
              aria-selected={index === selectedCommand}
              className="slash-command"
              onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault()}
              onClick={() => runSlashCommand(command)}
            >
              <span className="slash-command-icon"><command.icon size={15} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="slash-command-copy"><span className="slash-command-name">{command.label}</span><span className="slash-command-description">{command.description}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
