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

export function sameNonCanvasContent(content: ProjectContent, latest: Project) {
  return content.title.trim() === latest.title
    && content.splitRatio === latest.splitRatio
    && JSON.stringify(content.document) === JSON.stringify(latest.document)
    && JSON.stringify(content.notes) === JSON.stringify(latest.notes)
    && JSON.stringify(content.references) === JSON.stringify(latest.references);
}

export function sameProjectContent(content: ProjectContent, latest: Project) {
  return sameNonCanvasContent(content, latest)
    && JSON.stringify(content.canvas) === JSON.stringify(latest.canvas);
}
