import { Columns2, FileText, LayoutGrid } from "lucide-react";
import { Button, cn } from "../../../shared/ui";
import type { WorkspaceViewMode } from "../model/pane-layout";

export function WorkspaceViewSwitcher({
  activeViewMode, onSelect,
}: {
  activeViewMode: WorkspaceViewMode;
  onSelect: (mode: WorkspaceViewMode) => void;
}) {
  const buttonClass = "grid !size-[34px] !min-h-[34px] place-items-center rounded-md p-0 text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent";
  const selectedClass = "bg-tint text-accent";
  return (
    <div className="flex flex-col items-center gap-[3px]" data-testid="workspace-view-switcher" role="group" aria-label="Workspace view">
      {(["canvas", "note", "split"] as const).map((mode) => {
        const label = mode === "canvas" ? "Canvas" : mode === "note" ? "Note" : "Split";
        const selected = activeViewMode === mode;
        const icon = mode === "canvas" ? <LayoutGrid size={17} strokeWidth={1.9} /> : mode === "note" ? <FileText size={17} strokeWidth={1.9} /> : <Columns2 size={17} strokeWidth={1.9} />;
        return <Button key={mode} type="button" variant="ghost" size="sm" className={cn(buttonClass, selected && selectedClass)} aria-label={label} title={label} aria-pressed={selected} onClick={() => onSelect(mode)}>{icon}</Button>;
      })}
    </div>
  );
}
