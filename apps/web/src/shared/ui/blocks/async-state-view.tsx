import type { ReactNode } from "react";
import { Button } from "../controls/button";
import { Skeleton } from "../feedback/skeleton";

export function AsyncStateView({
  status,
  loadingFallback,
  errorMessage,
  onRetry,
  empty = false,
  emptyFallback,
  children,
}: {
  status: "loading" | "error" | "ready";
  loadingFallback?: ReactNode;
  errorMessage?: string;
  onRetry?: () => void;
  empty?: boolean;
  emptyFallback?: ReactNode;
  children: ReactNode;
}) {
  if (status === "loading") {
    return loadingFallback ?? (
      <div className="grid gap-2 p-2" role="status" aria-live="polite" aria-label="Loading">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-3 text-xs text-danger">
        <span className="min-w-0 flex-1">{errorMessage ?? "Could not load data."}</span>
        {onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (empty) {
    return emptyFallback ?? null;
  }

  return <>{children}</>;
}
