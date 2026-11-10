import type { ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { nativeActionIcon } from "../native/CanvasNativeActions";
export const motionTransition = { duration: 0.16, ease: "easeOut" } as const;
export function MenuAction({ api, nativeAction, label, shortcut, onClick }: { api: ExcalidrawImperativeAPI | null; nativeAction?: string; label: string; shortcut?: string; onClick: () => void }) {
  const icon = nativeActionIcon(api, nativeAction);
  return (
    <button type="button" className="group flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={onClick}>
      {icon && <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <kbd className="rounded border border-line px-1 py-0.5 text-[8px] text-muted group-hover:border-accent group-hover:text-accent">{shortcut}</kbd>}
    </button>
  );
}

export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0" aria-label={label}>
      <h3 className="m-0 px-2 text-[9px] font-medium text-muted">{label}</h3>
      {children}
    </section>
  );
}
