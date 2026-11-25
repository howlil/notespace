type Binding = { elementId: string } | null | undefined;
type BoundElementRef = { id: string; type: string };
type Connectable<B extends BoundElementRef = BoundElementRef> = {
  id: string;
  startBinding?: Binding;
  endBinding?: Binding;
  boundElements?: readonly B[] | null;
};

/** Ids of arrows bound at either end to `elementId`. */
export function arrowsBoundTo(elements: readonly Connectable[], elementId: string): string[] {
  return elements
    .filter((element) => element.startBinding?.elementId === elementId || element.endBinding?.elementId === elementId)
    .map((element) => element.id);
}

/** Clears bindings that point at `elementId` so connectors survive the removal of a Note as free arrows. */
export function releaseArrowBindings<T extends Connectable>(
  elements: readonly T[],
  elementId: string,
  updateElement: (element: T, patch: { startBinding?: null; endBinding?: null }) => T = (element, patch) => ({
    ...element,
    ...patch,
  }),
): T[] {
  return elements.map((element) => {
    const start = element.startBinding?.elementId === elementId;
    const end = element.endBinding?.elementId === elementId;
    if (!start && !end) return element;
    return updateElement(element, {
      ...(start ? { startBinding: null } : {}),
      ...(end ? { endBinding: null } : {}),
    });
  });
}

/** Removes deleted connector ids from surviving elements' `boundElements` lists. */
export function pruneBoundElements<B extends BoundElementRef, T extends Connectable<B>>(
  elements: readonly T[],
  removedIds: ReadonlySet<string>,
  updateElement: (element: T, patch: { boundElements: readonly B[] | null }) => T = (element, patch) => ({
    ...element,
    ...patch,
  }),
): T[] {
  if (removedIds.size === 0) return [...elements];
  return elements.map((element) => {
    const existing = element.boundElements;
    if (!existing || existing.length === 0) return element;
    const next = existing.filter((ref) => !removedIds.has(ref.id));
    if (next.length === existing.length) return element;
    return updateElement(element, { boundElements: next.length > 0 ? next : null });
  });
}
