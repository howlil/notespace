import { Skeleton } from "../ui";

export function WorkspaceListSkeleton({ rows = 5 }: { rows?: number }) {
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
