import { Skeleton } from "../../shared/ui";

export function WorkspaceListSkeleton({ rows = 5, variant = "list" }: { rows?: number; variant?: "list" | "cards" }) {
  if (variant === "cards") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,196px))] gap-4 max-[560px]:grid-cols-[repeat(auto-fill,minmax(156px,180px))]" role="status" aria-label="Loading workspaces">
        <span className="sr-only">Loading workspaces…</span>
        {Array.from({ length: Math.min(rows, 8) }, (_, index) => (
          <div className="relative aspect-square w-full max-w-[196px] overflow-hidden rounded-[18px] border border-accent/40 bg-accent" key={index}>
            <Skeleton className="absolute left-[24%] top-[13%] h-[47%] w-[48%] -rotate-[9deg] rounded-[10px] border border-line bg-background" />
            <Skeleton className="absolute inset-x-0 bottom-0 h-[61%] rounded-t-[18px] rounded-b-none border-t border-white/50 bg-surface/75 backdrop-blur-lg" />
            <div className="absolute inset-x-4 bottom-4 z-10 grid gap-1.5">
              <Skeleton className="h-3.5 w-[58%] bg-line/70" />
              <Skeleton className="h-2 w-[76%] bg-line/50 opacity-70" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-line" role="status" aria-label="Loading workspaces">
      <span className="sr-only">Loading workspaces…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="grid min-h-[72px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-4 max-[560px]:min-h-[66px] max-[560px]:grid-cols-[30px_minmax(0,1fr)] max-[560px]:gap-2.5" key={index}>
          <Skeleton className="size-8 rounded-md max-[560px]:size-7" />
          <div className="grid min-w-0 gap-2">
            <Skeleton className="h-2.5 w-[min(42%,220px)]" />
            <Skeleton className="h-2 w-[min(28%,150px)] opacity-70" />
          </div>
          <Skeleton className="h-2 w-12 max-[560px]:col-start-2 max-[560px]:row-start-1 max-[560px]:justify-self-end" />
        </div>
      ))}
    </div>
  );
}
