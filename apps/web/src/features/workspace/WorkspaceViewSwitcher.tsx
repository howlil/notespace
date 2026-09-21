import { Columns2, FileText, LayoutGrid } from "lucide-react";
import { Button, cn } from "../../components/ui";
import type { WorkspaceViewMode } from "./pane-layout";

export function WorkspaceViewSwitcher({ activeViewMode, onSelect }: { activeViewMode: WorkspaceViewMode; onSelect: (mode: WorkspaceViewMode) => void }) {
  return (
    <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 bg-transparent max-[760px]:relative max-[760px]:inset-auto max-[760px]:order-2 max-[760px]:self-center max-[760px]:translate-x-0 max-[760px]:translate-y-0 max-[560px]:order-none max-[560px]:col-start-1 max-[560px]:row-start-2 max-[560px]:justify-self-start max-[560px]:self-center max-[560px]:shrink-0" data-testid="workspace-view-switcher" role="group" aria-label="Workspace view">
      {(["canvas", "note", "split"] as const).map((mode) => {
        const label = mode === "canvas" ? "Canvas" : mode === "note" ? "Note" : "Split";
        const selected = activeViewMode === mode;
        const icon = mode === "canvas" ? <LayoutGrid size={22} strokeWidth={2.1} /> : mode === "note" ? <FileText size={22} strokeWidth={2.1} /> : <Columns2 size={22} strokeWidth={2.1} />;
        return <Button key={mode} type="button" variant="ghost" size="sm" className={cn("relative !size-9 !min-h-9 rounded-[5px] p-0 text-muted", selected && "bg-tint text-accent ring-1 ring-accent/15 hover:bg-tint hover:text-accent")} aria-label={label} title={label} aria-pressed={selected} onClick={() => onSelect(mode)}>{icon}</Button>;
      })}
    </div>
  );
}
