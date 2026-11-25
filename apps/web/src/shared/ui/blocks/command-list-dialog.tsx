import type { ReactNode } from "react";
import { cn } from "../class-names";
import { SearchInput } from "../controls/search-input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../overlays/dialog";
import { AsyncStateView } from "./async-state-view";

export function CommandListDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  dataAttribute,
  query,
  onQueryChange,
  placeholder,
  searchAriaLabel,
  searchRightSlot,
  subHeader,
  status,
  loadingFallback,
  errorMessage,
  onRetry,
  items,
  selectedIndex,
  onSelect,
  onSelectedIndexChange,
  emptyFallback,
  listRole,
  listAriaLabel,
  bodyHeader,
  renderItem,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  size?: "sm" | "md" | "lg";
  dataAttribute?: Record<string, string>;
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  searchAriaLabel?: string;
  searchRightSlot?: ReactNode;
  subHeader?: ReactNode;
  status: "loading" | "error" | "ready";
  loadingFallback?: ReactNode;
  errorMessage?: string;
  onRetry?: () => void;
  items: readonly T[];
  selectedIndex: number;
  onSelect: (item: T) => void;
  onSelectedIndexChange: (index: number) => void;
  emptyFallback?: ReactNode;
  listRole?: "listbox";
  listAriaLabel?: string;
  bodyHeader?: ReactNode;
  renderItem: (item: T, state: { selected: boolean; index: number }) => ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size} padded={false} {...dataAttribute}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>

        <SearchInput
          autoFocus
          variant="flush"
          placeholder={placeholder}
          aria-label={searchAriaLabel ?? placeholder}
          value={query}
          onChange={onQueryChange}
          rightSlot={searchRightSlot}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && items.length > 0) {
              event.preventDefault();
              onSelectedIndexChange((selectedIndex + 1) % items.length);
            } else if (event.key === "ArrowUp" && items.length > 0) {
              event.preventDefault();
              onSelectedIndexChange((selectedIndex - 1 + items.length) % items.length);
            } else if (event.key === "Enter" && items.length > 0) {
              event.preventDefault();
              const chosen = items[selectedIndex] ?? items[0];
              if (chosen !== undefined) onSelect(chosen);
            }
          }}
        />

        {subHeader}

        <div className={cn("max-h-[min(56dvh,400px)] overflow-y-auto overscroll-contain p-1.5 no-scrollbar", bodyClassName)}>
          {bodyHeader}
          <AsyncStateView
            status={status}
            loadingFallback={loadingFallback}
            errorMessage={errorMessage}
            onRetry={onRetry}
            empty={items.length === 0}
            emptyFallback={emptyFallback}
          >
            <div className="grid gap-0.5" role={listRole} aria-label={listAriaLabel}>
              {items.map((item, index) => renderItem(item, { selected: index === selectedIndex, index }))}
            </div>
          </AsyncStateView>
        </div>
      </DialogContent>
    </Dialog>
  );
}
