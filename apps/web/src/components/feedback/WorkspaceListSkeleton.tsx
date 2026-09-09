import { Skeleton } from "../ui";

export function WorkspaceListSkeleton({ rows = 5, variant = "list" }: { rows?: number; variant?: "list" | "cards" }) {
  if (variant === "cards") {
    return (
      <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1" role="status" aria-label="Loading workspaces">
        <span className="sr-only">Loading workspaces…</span>
        {Array.from({ length: Math.min(rows, 6) }, (_, index) => (
          <div className="flex min-h-[126px] flex-col justify-between rounded-[14px] border border-line bg-surface p-3.5" key={index}>
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="size-9 rounded-[10px]" />
              <Skeleton className="mt-1 h-2 w-10 opacity-70" />
            </div>
            <div className="mt-5 grid gap-2">
              <Skeleton className="h-3.5 w-[58%]" />
              <Skeleton className="h-2.5 w-[76%] opacity-70" />
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
