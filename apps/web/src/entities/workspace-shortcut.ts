export const WORKSPACE_SHORTCUT_DATA_KEY = "notespaceWorkspaceShortcut";

export type CanvasWorkspaceShortcutReference = {
  targetWorkspaceId: string;
};

export function readCanvasWorkspaceShortcut(
  element: { customData?: unknown; isDeleted?: boolean } | null | undefined,
): CanvasWorkspaceShortcutReference | null {
  if (!element || element.isDeleted) return null;
  const customData = element.customData;
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return null;
  const raw = (customData as Record<string, unknown>)[WORKSPACE_SHORTCUT_DATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { targetWorkspaceId } = raw as Record<string, unknown>;
  if (typeof targetWorkspaceId !== "string" || targetWorkspaceId.trim().length === 0) {
    return null;
  }
  return { targetWorkspaceId };
}

export function withCanvasWorkspaceShortcut(
  customData: unknown,
  reference: CanvasWorkspaceShortcutReference,
): Record<string, unknown> {
  const base = customData && typeof customData === "object" && !Array.isArray(customData)
    ? (customData as Record<string, unknown>)
    : {};
  return {
    ...base,
    [WORKSPACE_SHORTCUT_DATA_KEY]: { targetWorkspaceId: reference.targetWorkspaceId },
  };
}

/** Returns `customData` without the workspace shortcut reference, or undefined when nothing else remains. */
export function withoutCanvasWorkspaceShortcut(customData: unknown): Record<string, unknown> | undefined {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return undefined;
  const rest = { ...(customData as Record<string, unknown>) };
  delete rest[WORKSPACE_SHORTCUT_DATA_KEY];
  return Object.keys(rest).length > 0 ? rest : undefined;
}
