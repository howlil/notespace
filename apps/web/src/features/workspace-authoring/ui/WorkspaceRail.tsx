import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Scan } from "lucide-react";
import type { WorkspaceViewMode } from "../model/pane-layout";
import { WorkspaceViewSwitcher } from "./WorkspaceViewSwitcher";

type Props = {
  activeViewMode: WorkspaceViewMode;
  planActive: boolean;
  onSelectView: (mode: WorkspaceViewMode) => void;
  onPlanSelect: () => void;
  onFocus: () => void;
  activityControl: ReactNode;
};

export function WorkspaceRail({
  activeViewMode, planActive, onSelectView, onPlanSelect, onFocus,
  activityControl,
}: Props) {
  const buttonClass = "grid !size-[34px] !min-h-[34px] place-items-center rounded-md text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent";
  return (
    <nav className="workspace-rail relative z-30 h-full w-10 shrink-0 border-r border-line bg-surface" aria-label="Workspace navigation">
      <div className="absolute top-2 left-[3px]">
        <Link to="/" className={buttonClass} aria-label="Back to library" title="Back to library">
          <ArrowLeft size={17} strokeWidth={1.9} aria-hidden="true" />
        </Link>
      </div>

      <div className="absolute top-1/2 left-[3px] -translate-y-1/2">
        <WorkspaceViewSwitcher
          activeViewMode={activeViewMode}
          planActive={planActive}
          onSelect={onSelectView}
          onPlanSelect={onPlanSelect}
        />
      </div>

      <div className="absolute bottom-2 left-[3px] flex flex-col items-center gap-[3px]">
        {activityControl}
        <button type="button" className={buttonClass} aria-label="Focus mode" title={planActive ? "Focus is available in Canvas, Note or Split" : "Focus mode"} disabled={planActive} onClick={onFocus}>
          <Scan size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
