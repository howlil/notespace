import type { Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  Code2,
  Frame,
  Heading2,
  ImagePlus,
  List,
  ListOrdered,
  Minus,
  Quote,
  Sigma,
  Table2,
} from "lucide-react";

export type DocumentSlashCommand = {
  label: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  kind?: "canvas-frame";
  run?: (editor: Editor) => void;
};

export function createDocumentSlashCommands(onPickImage: () => void): DocumentSlashCommand[] {
  return [
    { label: "Heading", description: "Large section heading", keywords: "heading h2", icon: Heading2, run: (editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
    { label: "Bullet list", description: "Turn this into a list", keywords: "bullet list ul", icon: List, run: (editor) => { editor.chain().focus().toggleBulletList().run(); } },
    { label: "Numbered list", description: "Create an ordered list", keywords: "numbered ordered list ol", icon: ListOrdered, run: (editor) => { editor.chain().focus().toggleOrderedList().run(); } },
    { label: "Checklist", description: "Interactive task list", keywords: "task todo checkbox checklist", icon: CheckSquare, run: (editor) => { editor.chain().focus().toggleTaskList().run(); } },
    { label: "Table", description: "Insert a 3 × 3 comparison table", keywords: "table grid compare", icon: Table2, run: (editor) => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
    { label: "Quote", description: "Highlight a passage", keywords: "quote blockquote", icon: Quote, run: (editor) => { editor.chain().focus().toggleBlockquote().run(); } },
    { label: "Code block", description: "Syntax-highlighted code", keywords: "code pre source", icon: Code2, run: (editor) => { editor.chain().focus().toggleCodeBlock().run(); } },
    { label: "Link canvas", description: "Embed a Canvas frame preview", keywords: "link canvas frame embed preview", icon: Frame, kind: "canvas-frame" },
    { label: "Inline math", description: "Insert a compact equation", keywords: "math equation latex inline", icon: Sigma, run: (editor) => { editor.chain().focus().insertInlineMath({ latex: "x^2" }).run(); } },
    { label: "Math block", description: "Insert a display equation", keywords: "math equation latex block", icon: Sigma, run: (editor) => { editor.chain().focus().insertBlockMath({ latex: "\\frac{a}{b}" }).run(); } },
    { label: "Image", description: "Choose an image from this device", keywords: "image photo upload", icon: ImagePlus, run: onPickImage },
    { label: "Divider", description: "Add a horizontal rule", keywords: "divider rule line", icon: Minus, run: (editor) => { editor.chain().focus().setHorizontalRule().run(); } },
  ];
}
