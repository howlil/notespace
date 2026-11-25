import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Mathematics from "@tiptap/extension-mathematics";
import { Markdown } from "@tiptap/markdown";
import { isSafeNoteLink } from "../../../entities/note";
import { NoteBlockIdentity } from "./block-identity";
import { NotePlaceholder } from "./placeholder";
import { NoteBlockReference, NoteEmbed, NoteImage } from "./note-links";
import { NoteCallout } from "./note-callout";
import { NoteToggle, NoteToggleSummary } from "./note-toggle";
import { NoteHighlight, NoteTextColor } from "./note-marks";

export type NoteMathEditRequest = {
  pos: number;
  latex: string;
  block: boolean;
};

export type CreateNoteExtensionsOptions = {
  onEditMath?: (info: NoteMathEditRequest) => void;
};

/**
 * One schema for the editor and the read-only renderer. StarterKit's own Link/Underline are
 * disabled so the configured safe-link policy below is the only Link implementation.
 */
export function createNoteExtensions(options?: CreateNoteExtensionsOptions): Extensions {
  const onEditMath = options?.onEditMath;
  return [
    StarterKit.configure({ link: false, underline: false }),
    NoteImage,
    NoteEmbed,
    NoteBlockReference,
    NoteCallout,
    NoteToggle,
    NoteToggleSummary,
    NoteHighlight,
    NoteTextColor,
    NoteBlockIdentity,
    NotePlaceholder,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ["http", "https", "mailto"],
      isAllowedUri: (url, context) => isSafeNoteLink(url) && (url.startsWith("/") || context.defaultValidate(url)),
    }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Mathematics.configure({
      katexOptions: { throwOnError: false, strict: false, trust: false },
      ...(onEditMath
        ? {
            inlineOptions: {
              onClick: (node, pos) => {
                onEditMath({
                  pos,
                  latex: typeof node.attrs.latex === "string" ? node.attrs.latex : "",
                  block: false,
                });
              },
            },
            blockOptions: {
              onClick: (node, pos) => {
                onEditMath({
                  pos,
                  latex: typeof node.attrs.latex === "string" ? node.attrs.latex : "",
                  block: true,
                });
              },
            },
          }
        : {}),
    }),
    Markdown,
  ];
}
