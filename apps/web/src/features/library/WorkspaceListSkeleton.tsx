import { Skeleton } from "../../shared/ui";

export function WorkspaceListSkeleton({ rows = 5 }: { rows?: number }) {
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
