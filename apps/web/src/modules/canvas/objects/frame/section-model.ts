import { readCanvasNoteReference } from "../../../../entities/note.ts";
import { readCanvasWorkspaceShortcut } from "../../../../entities/workspace-shortcut.ts";

export type SectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SectionElementLike = {
  id: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  frameId?: string | null;
  name?: string | null;
  text?: string;
  customData?: unknown;
};

export type WorkspaceOutlineChild = {
  elementId: string;
  noteId?: string;
  label: string;
  kind: "note" | "shortcut" | "object";
};

export type WorkspaceOutlineUngroupedItem = {
  elementId: string;
  noteId?: string;
  label: string;
  kind: "note" | "shortcut";
};

export type WorkspaceOutlineSection = {
  elementId: string;
  label: string;
  children: WorkspaceOutlineChild[];
};

export type WorkspaceOutlineTree = {
  sections: WorkspaceOutlineSection[];
  ungrouped: WorkspaceOutlineUngroupedItem[];
};

function isFrameType(element: { type?: string }): boolean {
  return element.type === "frame" || element.type === "magicframe";
}

function normalizedBox(element: { x: number; y: number; width: number; height: number }) {
  const x1 = Math.min(element.x, element.x + element.width);
  const x2 = Math.max(element.x, element.x + element.width);
  const y1 = Math.min(element.y, element.y + element.height);
  const y2 = Math.max(element.y, element.y + element.height);
  return { x1, y1, x2, y2 };
}

export function computeSectionBoundsAroundElements(
  elements: ReadonlyArray<Pick<SectionElementLike, "x" | "y" | "width" | "height" | "isDeleted">>,
  padding = 32,
): SectionBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const element of elements) {
    if (element.isDeleted) continue;
    const { x1, y1, x2, y2 } = normalizedBox(element);
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
    count += 1;
  }

  if (count === 0) return null;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function isElementContainedInFrame(
  element: Pick<SectionElementLike, "id" | "x" | "y" | "width" | "height" | "isDeleted">,
  frame: Pick<SectionElementLike, "id" | "x" | "y" | "width" | "height" | "isDeleted">,
): boolean {
  if (element.isDeleted || frame.isDeleted || element.id === frame.id) return false;
  const frameBox = normalizedBox(frame);
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  return (
    centerX >= frameBox.x1
    && centerX <= frameBox.x2
    && centerY >= frameBox.y1
    && centerY <= frameBox.y2
  );
}

export function findDeepestContainingFrame<T extends Pick<SectionElementLike, "id" | "x" | "y" | "width" | "height" | "isDeleted">>(
  element: Pick<SectionElementLike, "id" | "x" | "y" | "width" | "height" | "isDeleted">,
  frames: readonly T[],
): T | null {
  let best: T | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const frame of frames) {
    if (!isElementContainedInFrame(element, frame)) continue;
    const area = Math.abs(frame.width * frame.height);
    if (
      best === null
      || area < bestArea
      || (area === bestArea && frame.id.localeCompare(best.id) < 0)
    ) {
      best = frame;
      bestArea = area;
    }
  }

  return best;
}

export function computeFitSectionBounds(
  frame: Pick<SectionElementLike, "x" | "y" | "width" | "height">,
  members: ReadonlyArray<Pick<SectionElementLike, "x" | "y" | "width" | "height" | "isDeleted">>,
  padding = 28,
): SectionBounds {
  const computed = computeSectionBoundsAroundElements(members, padding);
  if (!computed) {
    return {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
  }
  return computed;
}

export function computeTidySectionLayout(
  frame: Pick<SectionElementLike, "x" | "y" | "width" | "height">,
  members: ReadonlyArray<Pick<SectionElementLike, "id" | "x" | "y" | "width" | "height" | "isDeleted">>,
  gap = 16,
  padding = 28,
): Array<{ id: string; x: number; y: number }> {
  const liveMembers = members
    .filter((member) => !member.isDeleted)
    .slice()
    .sort((a, b) => {
      const rowDelta = Math.round(a.y / 24) - Math.round(b.y / 24);
      if (rowDelta !== 0) return rowDelta;
      if (a.x !== b.x) return a.x - b.x;
      return a.id.localeCompare(b.id);
    });

  if (liveMembers.length === 0) return [];

  const maxMemberWidth = liveMembers.reduce((max, member) => Math.max(max, member.width), 0);
  const innerWidth = Math.max(frame.width - padding * 2, maxMemberWidth);
  const startX = frame.x + padding;
  let cursorX = startX;
  let cursorY = frame.y + padding;
  let rowHeight = 0;

  return liveMembers.map((member) => {
    if (cursorX > startX && cursorX + member.width > startX + innerWidth) {
      cursorX = startX;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    const placement = { id: member.id, x: cursorX, y: cursorY };
    cursorX += member.width + gap;
    rowHeight = Math.max(rowHeight, member.height);
    return placement;
  });
}

export function buildWorkspaceOutlineTree(
  elements: readonly SectionElementLike[],
  readNoteLabel: (noteId: string) => string | undefined,
  readWorkspaceTitle: (workspaceId: string) => string | undefined,
): WorkspaceOutlineTree {
  const sections: WorkspaceOutlineSection[] = [];
  const sectionById = new Map<string, WorkspaceOutlineSection>();
  const ungrouped: WorkspaceOutlineUngroupedItem[] = [];

  for (const element of elements) {
    if (element.isDeleted || !isFrameType(element)) continue;
    const section: WorkspaceOutlineSection = {
      elementId: element.id,
      label: element.name?.trim() || "Untitled section",
      children: [],
    };
    sections.push(section);
    sectionById.set(element.id, section);
  }

  for (const element of elements) {
    if (element.isDeleted || isFrameType(element)) continue;

    const noteRef = readCanvasNoteReference(element);
    const shortcutRef = noteRef ? null : readCanvasWorkspaceShortcut(element);

    let child: WorkspaceOutlineChild;
    if (noteRef) {
      child = {
        elementId: element.id,
        noteId: noteRef.noteId,
        label: readNoteLabel(noteRef.noteId)?.trim() || "Untitled note",
        kind: "note",
      };
    } else if (shortcutRef) {
      child = {
        elementId: element.id,
        label: readWorkspaceTitle(shortcutRef.targetWorkspaceId)?.trim() || "Unavailable workspace",
        kind: "shortcut",
      };
    } else {
      child = {
        elementId: element.id,
        label: element.text?.trim() || element.type || "Object",
        kind: "object",
      };
    }

    const parentSection = element.frameId ? sectionById.get(element.frameId) : undefined;
    if (parentSection) {
      parentSection.children.push(child);
    } else if (child.kind === "note" || child.kind === "shortcut") {
      ungrouped.push({
        elementId: child.elementId,
        ...(child.noteId ? { noteId: child.noteId } : {}),
        label: child.label,
        kind: child.kind,
      });
    }
  }

  return { sections, ungrouped };
}
