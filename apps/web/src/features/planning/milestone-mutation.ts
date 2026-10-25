import type { PlanningMilestone, WorkspacePlan } from "../../domain/planning/planning.ts";

export type MilestonePatch = { title?: string; completed?: boolean };
export type MilestoneMutationOutcome =
  | { status: "confirmed"; milestone: PlanningMilestone; reconciled: boolean }
  | { status: "conflict"; milestone: PlanningMilestone }
  | { status: "not-applied"; milestone: PlanningMilestone }
  | { status: "missing" }
  | { status: "unknown" };

export function matchesMilestonePatch(milestone: PlanningMilestone, patch: MilestonePatch): boolean {
  if (patch.title !== undefined && milestone.title !== patch.title.trim()) return false;
  if (patch.completed !== undefined && Boolean(milestone.completedAt) !== patch.completed) return false;
  return true;
}

/** Never replay an uncertain PATCH. Confirm it from the same Workspace's durable Plan. */
export async function reconcileMilestonePatch(
  original: PlanningMilestone,
  patch: MilestonePatch,
  commit: () => Promise<PlanningMilestone>,
  read: () => Promise<WorkspacePlan>,
): Promise<MilestoneMutationOutcome> {
  try {
    return { status: "confirmed", milestone: await commit(), reconciled: false };
  } catch {
    try {
      const plan = await read();
      if (plan.workspaceId !== original.workspaceId) return { status: "unknown" };
      const current = plan.milestones.find((item) => item.id === original.id);
      if (!current) return { status: "missing" };
      if (current.version === original.version + 1 && matchesMilestonePatch(current, patch)) {
        return { status: "confirmed", milestone: current, reconciled: true };
      }
      if (current.version === original.version
        && current.title === original.title
        && current.completedAt === original.completedAt) {
        return { status: "not-applied", milestone: current };
      }
      return { status: "conflict", milestone: current };
    } catch {
      return { status: "unknown" };
    }
  }
}
