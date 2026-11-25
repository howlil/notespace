import type { Editor } from "@tiptap/core";

export function NoteTableToolbar({ editor, isModal }: { editor: Editor; isModal: boolean }) {
  return (
    <div
      className={
        "notespace-note-ui absolute z-[var(--z-popover)] flex items-center gap-0.5 rounded-lg border border-line bg-surface px-1.5 py-1 [box-shadow:var(--shadow-popup)] "
        + (isModal ? "right-2 top-1" : "bottom-full left-2 mb-1")
      }
      role="toolbar"
      aria-label="Note table actions"
    >
      <button type="button" className="rounded px-1.5 py-0.5 text-2xs text-muted hover:bg-tint hover:text-ink" aria-label="Add table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Row +</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-2xs text-muted hover:bg-tint hover:text-ink" aria-label="Delete table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>Row -</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-2xs text-muted hover:bg-tint hover:text-ink" aria-label="Add table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Column +</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-2xs text-muted hover:bg-tint hover:text-ink" aria-label="Delete table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>Col -</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-2xs text-danger hover:bg-tint" aria-label="Delete table" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
    </div>
  );
}
