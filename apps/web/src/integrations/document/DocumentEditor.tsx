import type { Editor } from "@tiptap/core";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UniqueID from "@tiptap/extension-unique-id";
import { Bold, Code2, Heading2, Italic, List, Pilcrow } from "lucide-react";
import { useEffect } from "react";
import type { Snapshot } from "../../domain/project/project";

type FocusRequest = { id: string; request: number } | null;

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

export default function DocumentEditor({
  initial,
  onChange,
  onBlockSelect,
  focusRequest,
}: {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  onBlockSelect?: (blockId: string | null) => void;
  focusRequest?: FocusRequest;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      UniqueID.configure({
        types: ["paragraph", "heading", "codeBlock", "listItem"],
        attributeName: "blockId",
      }),
    ],
    content: initial.data,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Project document",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      onChange({ format: "tiptap", version: 1, data: editor.getJSON() });
      onBlockSelect?.(selectedBlockId(editor));
    },
    onSelectionUpdate: ({ editor }) => {
      onBlockSelect?.(selectedBlockId(editor));
    },
  });
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold"),
      italic: editor?.isActive("italic"),
      heading: editor?.isActive("heading"),
      list: editor?.isActive("bulletList"),
      code: editor?.isActive("codeBlock"),
    }),
  });

  useEffect(() => {
    if (!editor || !focusRequest) return;
    const position = findBlockPosition(editor, focusRequest.id);
    if (position === null) return;
    editor.chain().focus().setTextSelection(position).scrollIntoView().run();
  }, [editor, focusRequest]);

  if (!editor)
    return (
      <div className="editor-loading" role="status">
        Opening document…
      </div>
    );
  const tools = [
    {
      label: "Paragraph",
      icon: Pilcrow,
      active: false,
      run: () => editor.chain().focus().setParagraph().run(),
    },
    {
      label: "Heading",
      icon: Heading2,
      active: active?.heading,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Bold",
      icon: Bold,
      active: active?.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: Italic,
      active: active?.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Bullet list",
      icon: List,
      active: active?.list,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Code block",
      icon: Code2,
      active: active?.code,
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];
  return (
    <div className="document-editor">
      <div
        className="format-toolbar"
        role="toolbar"
        aria-label="Document formatting"
      >
        {tools.map((tool) => (
          <button
            key={tool.label}
            className="icon-button"
            aria-label={tool.label}
            title={tool.label}
            aria-pressed={!!tool.active}
            onClick={tool.run}
          >
            <tool.icon size={17} />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
