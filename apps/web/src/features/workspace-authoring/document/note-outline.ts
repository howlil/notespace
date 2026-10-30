export type NoteOutlineItem = { id: string; level: number; text: string };

/** A heading owns subsequent deeper headings until the next peer or ancestor. */
export function visibleNoteOutline(items: NoteOutlineItem[], collapsed: ReadonlySet<string>) {
  const visible: Array<NoteOutlineItem & { hasChildren: boolean }> = [];
  let hiddenBelow = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (hiddenBelow && item.level <= hiddenBelow) hiddenBelow = 0;
    const hasChildren = i + 1 < items.length && items[i + 1].level > item.level;
    if (!hiddenBelow) visible.push({ ...item, hasChildren });
    if (!hiddenBelow && hasChildren && collapsed.has(item.id)) hiddenBelow = item.level;
  }
  return visible;
}
