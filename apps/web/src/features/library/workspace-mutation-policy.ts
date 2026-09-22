export function workspaceRenameTitle(rawTitle: string, currentTitle?: string): string | null {
  const title = rawTitle.trim();
  if (!title || (currentTitle !== undefined && title === currentTitle.trim())) return null;
  return title;
}

export function workspaceMutationError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
