import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CardsAppIcon, WorkspaceMapAppIcon, cn } from "../../../shared/ui";

type Props = {
  activeRoute?: "home" | "map" | "cards" | "workspace";
  browserTabs?: ReactNode;
};

export function LibrarySidebar({
  activeRoute = "home",
  browserTabs,
}: Props) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden bg-sidebar px-1.5 py-1.5 select-none" aria-label="Workspace explorer">
      <nav aria-label="Library navigation" className="grid shrink-0 gap-1">
        <Link
          to="/map"
          search={{}}
          className={cn(
            "flex min-h-[30px] items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] font-medium transition-colors",
            activeRoute === "map"
              ? "bg-surface text-ink ring-1 ring-inset ring-line/80"
              : "text-ink/85 hover:bg-ink/[0.05] hover:text-ink",
          )}
          aria-current={activeRoute === "map" ? "page" : undefined}
        >
          <WorkspaceMapAppIcon active={activeRoute === "map"} />
          <span className="truncate">Workspace Map</span>
        </Link>
        <Link
          to="/cards"
          className={cn(
            "flex min-h-[30px] items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] font-medium transition-colors",
            activeRoute === "cards"
              ? "bg-surface text-ink ring-1 ring-inset ring-line/80"
              : "text-ink/85 hover:bg-ink/[0.05] hover:text-ink",
          )}
          aria-current={activeRoute === "cards" ? "page" : undefined}
        >
          <CardsAppIcon active={activeRoute === "cards"} />
          <span className="truncate">Cards</span>
        </Link>
      </nav>

      {browserTabs}
    </aside>
  );
}
