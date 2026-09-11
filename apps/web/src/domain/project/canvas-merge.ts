import type { Project, ProjectContent, Snapshot } from "./project";

type CanvasElement = Record<string, unknown> & {
  id: string;
  version?: number;
  versionNonce?: number;
  index?: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canvasElements(snapshot: Snapshot): CanvasElement[] {
  const elements = snapshot.data.elements;
  if (!Array.isArray(elements)) return [];
  return elements.filter((element): element is CanvasElement => {
    return !!element && typeof element === "object" && typeof (element as CanvasElement).id === "string";
  });
}

function keepLocalElement(local: CanvasElement, remote: CanvasElement) {
  const localVersion = typeof local.version === "number" ? local.version : 0;
  const remoteVersion = typeof remote.version === "number" ? remote.version : 0;
  if (localVersion !== remoteVersion) return localVersion > remoteVersion;

  // This matches Excalidraw's deterministic collaboration tie-break: when
  // versions are equal, the lowest versionNonce wins on every peer.
  const localNonce = typeof local.versionNonce === "number" ? local.versionNonce : Number.MAX_SAFE_INTEGER;
  const remoteNonce = typeof remote.versionNonce === "number" ? remote.versionNonce : Number.MAX_SAFE_INTEGER;
  return localNonce <= remoteNonce;
}

function mergeElements(localElements: CanvasElement[], remoteElements: CanvasElement[]) {
  const localById = new Map(localElements.map((element) => [element.id, element]));
  const added = new Set<string>();
  const merged: CanvasElement[] = [];

  for (const remote of remoteElements) {
    if (added.has(remote.id)) continue;
    const local = localById.get(remote.id);
    merged.push(local && keepLocalElement(local, remote) ? local : remote);
    added.add(remote.id);
  }
  for (const local of localElements) {
    if (added.has(local.id)) continue;
    merged.push(local);
    added.add(local.id);
  }

  // Modern Excalidraw elements carry fractional `index` values. Sorting them
  // keeps layer order deterministic after independently-added elements meet.
  if (merged.every((element) => typeof element.index === "string")) {
    merged.sort((a, b) => String(a.index).localeCompare(String(b.index)));
  }
  return merged;
}

function isIdentifiedArray(value: unknown): value is Array<Record<string, unknown> & { id: string }> {
  return Array.isArray(value)
    && value.every((item) => !!item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");
}

function mergeIdentifiedArray(
  remote: Array<Record<string, unknown> & { id: string }>,
  local: Array<Record<string, unknown> & { id: string }>,
) {
  const merged = new Map(remote.map((item) => [item.id, item]));
  for (const item of local) merged.set(item.id, item);
  return [...merged.values()];
}

/**
 * Merge two durable Excalidraw snapshots without dropping independently-made
 * elements. Element version/versionNonce semantics follow Excalidraw's own
 * collaboration reconciliation rule. Local app preferences win because view
 * state is not authored canvas content.
 */
export function mergeCanvasSnapshots(local: Snapshot, remote: Snapshot): Snapshot {
  if (local.format !== "excalidraw" || remote.format !== "excalidraw") return local;

  const localData = objectValue(local.data);
  const remoteData = objectValue(remote.data);
  const data: Record<string, unknown> = { ...remoteData, ...localData };

  for (const key of new Set([...Object.keys(remoteData), ...Object.keys(localData)])) {
    if (key === "elements" || key === "appState" || key === "files") continue;
    const remoteValue = remoteData[key];
    const localValue = localData[key];
    if (isIdentifiedArray(remoteValue) && isIdentifiedArray(localValue)) {
      data[key] = mergeIdentifiedArray(remoteValue, localValue);
    }
  }

  data.elements = mergeElements(canvasElements(local), canvasElements(remote));
  data.appState = { ...objectValue(remoteData.appState), ...objectValue(localData.appState) };
  data.files = {};

  return {
    format: "excalidraw",
    version: Math.max(local.version, remote.version),
    data,
  };
}

function sameJSON(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

type MergeFieldResult<T> = { value: T } | null;

function mergeField<T>(base: T, local: T, remote: T, same: (left: T, right: T) => boolean): MergeFieldResult<T> {
  if (same(local, remote)) return { value: local };
  const localChanged = !same(local, base);
  const remoteChanged = !same(remote, base);
  if (!localChanged) return { value: remote };
  if (!remoteChanged) return { value: local };
  return null;
}

/**
 * Three-way merge for a stale workspace save. Unrelated remote fields are
 * adopted automatically, local-only fields are preserved, and true concurrent
 * edits to the same non-Canvas field still surface as a conflict.
 */
export function mergeProjectContent(base: ProjectContent, local: ProjectContent, remote: ProjectContent): ProjectContent | null {
  const title = mergeField(base.title.trim(), local.title.trim(), remote.title.trim(), (left, right) => left === right);
  const document = mergeField(base.document, local.document, remote.document, sameJSON);
  const notes = mergeField(base.notes, local.notes, remote.notes, sameJSON);
  const references = mergeField(base.references, local.references, remote.references, sameJSON);
  const splitRatio = mergeField(base.splitRatio, local.splitRatio, remote.splitRatio, (left, right) => left === right);
  if (!title || !document || !notes || !references || !splitRatio) return null;

  let canvas: Snapshot;
  if (sameJSON(local.canvas, remote.canvas)) canvas = local.canvas;
  else if (sameJSON(local.canvas, base.canvas)) canvas = remote.canvas;
  else if (sameJSON(remote.canvas, base.canvas)) canvas = local.canvas;
  else canvas = mergeCanvasSnapshots(local.canvas, remote.canvas);

  return {
    title: title.value,
    document: document.value,
    notes: notes.value,
    canvas,
    references: references.value,
    splitRatio: splitRatio.value,
  };
}

/**
 * Rebase edits made after a request started onto the server acknowledgement.
 * Fields untouched since `base` adopt the acknowledged value. Newer local
 * edits stay local; Canvas edits are merged so a slow save cannot erase them.
 */
export function rebaseLocalProjectContent(base: ProjectContent, local: ProjectContent, remote: ProjectContent): ProjectContent {
  const localTitleChanged = local.title.trim() !== base.title.trim();
  const localDocumentChanged = !sameJSON(local.document, base.document);
  const localNotesChanged = !sameJSON(local.notes, base.notes);
  const localReferencesChanged = !sameJSON(local.references, base.references);
  const localSplitChanged = local.splitRatio !== base.splitRatio;
  const localCanvasChanged = !sameJSON(local.canvas, base.canvas);

  return {
    title: localTitleChanged ? local.title.trim() : remote.title,
    document: localDocumentChanged ? local.document : remote.document,
    notes: localNotesChanged ? local.notes : remote.notes,
    canvas: localCanvasChanged ? mergeCanvasSnapshots(local.canvas, remote.canvas) : remote.canvas,
    references: localReferencesChanged ? local.references : remote.references,
    splitRatio: localSplitChanged ? local.splitRatio : remote.splitRatio,
  };
}

export function sameNonCanvasContent(content: ProjectContent, latest: Project) {
  return content.title.trim() === latest.title
    && content.splitRatio === latest.splitRatio
    && sameJSON(content.document, latest.document)
    && sameJSON(content.notes, latest.notes)
    && sameJSON(content.references, latest.references);
}

export function sameProjectContent(content: ProjectContent, latest: Project) {
  return sameNonCanvasContent(content, latest)
    && sameJSON(content.canvas, latest.canvas);
}
