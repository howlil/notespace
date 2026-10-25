/** A pending Capture is an intake item, not an independent Task or Note. */
export type CaptureItem = {
  id: string;
  content: string;
  status: "pending" | "converted";
  version: number;
  createdAt: string;
  updatedAt: string;
  targetKind?: "note" | "task";
  targetWorkspaceId?: string;
  targetId?: string;
  convertedAt?: string;
};

export type OrganizeCaptureInput = {
  version: number;
  workspaceId: string;
  kind: "note" | "task";
  document?: import("../workspace/workspace").Snapshot;
};

export const MAX_CAPTURE_BYTES = 65_536;
/** Matches the 64 KiB byte limit in the server, including Unicode. */
export function validCaptureContent(value: string): boolean {
  return value.trim().length > 0 && new TextEncoder().encode(value).length <= MAX_CAPTURE_BYTES;
}

/** A lost-response receipt only proves the exact submitted Capture version. */
export function isMatchingCaptureConversion(
  actual: CaptureItem,
  submitted: Pick<OrganizeCaptureInput, "version" | "workspaceId" | "kind">,
) {
  return actual.status === "converted"
    && actual.version === submitted.version + 1
    && actual.targetWorkspaceId === submitted.workspaceId
    && actual.targetKind === submitted.kind
    && Boolean(actual.targetId);
}
