import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, IconButton } from "../controls/button";
import { cn } from "../class-names";
import { enqueueToast, MAX_VISIBLE_TOASTS, updateToastItem } from "./toast-state";
import type { ToastInput, ToastItem, ToastKind, ToastPatch } from "./toast-state";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type { ToastAction, ToastInput, ToastKind } from "./toast-state";

type ToastContextValue = {
  showToast: (input: ToastInput) => string;
  updateToast: (id: string, patch: ToastPatch) => void;
  dismissToast: (id: string) => void;
};
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const dismissToast = useCallback((id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);
  const updateToast = useCallback((id: string, patch: ToastPatch) => {
    setToasts((items) => updateToastItem(items, id, patch));
  }, []);
  const showToast = useCallback((input: ToastInput) => {
    const id = input.id ?? `toast-${++sequence.current}`;
    setToasts((items) => enqueueToast(items, input, id));
    return id;
  }, []);
  const value = useMemo(() => ({ showToast, updateToast, dismissToast }), [showToast, updateToast, dismissToast]);
  return <ToastContext.Provider value={value}>
    {children}
    <ToastViewport toasts={toasts} dismiss={dismissToast} />
  </ToastContext.Provider>;
}

function ToastGlyph({ kind }: { kind: ToastKind }) {
  const className = cn("shrink-0",
    kind === "error" ? "text-danger" : kind === "success" ? "text-success" :
    kind === "warning" ? "text-warning" : "text-accent");
  if (kind === "loading") return <LoaderCircle size={14} className={cn(className, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />;
  if (kind === "error") return <AlertCircle size={14} className={className} aria-hidden="true" />;
  if (kind === "warning") return <AlertTriangle size={14} className={className} aria-hidden="true" />;
  if (kind === "success") return <CheckCircle2 size={14} className={className} aria-hidden="true" />;
  return <Info size={14} className={className} aria-hidden="true" />;
}

function ToastCard({ toast, dismiss }: { toast: ToastItem; dismiss: (id: string) => void }) {
  const kind = toast.kind;
  const hasDescription = Boolean(toast.description);
  return <motion.article
    layout
    data-toast-id={toast.id}
    onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); dismiss(toast.id); } }}
    role={kind === "error" ? "alert" : "status"}
    aria-live={kind === "error" ? "assertive" : "polite"}
    aria-atomic="true"
    initial={{ opacity: 0, y: 8, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 6, scale: 0.98 }}
    transition={{ duration: 0.14, ease: "easeOut" }}
    className={cn(
      "pointer-events-auto relative flex min-w-0 gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-ink shadow-[var(--shadow-popup)]",
      hasDescription ? "items-start" : "items-center",
    )}
  >
    <span className={cn("flex shrink-0 items-center", hasDescription && "mt-0.5")}>
      <ToastGlyph kind={kind} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="m-0 break-words text-[12px] font-medium leading-[1.4] text-ink">{toast.message}</p>
      {toast.description && <p className="m-0 mt-0.5 break-words text-[11px] leading-[1.4] text-muted">{toast.description}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {toast.action && <Button
        type="button" variant="ghost" size="xs"
        className="border border-line bg-background/70 text-ink hover:bg-tint"
        onClick={(event) => {
          const action = toast.action;
          // Keyboard focus remains inside the notification after Retry morphs to Loading.
          if (action?.dismissOnClick === false && event.detail === 0) {
            event.currentTarget.closest("article")?.querySelector<HTMLButtonElement>(
              'button[aria-label="Dismiss notification"]',
            )?.focus();
          }
          action?.onClick();
          if (action?.dismissOnClick !== false) dismiss(toast.id);
        }}
      >{toast.action.label}</Button>}
      <IconButton type="button" variant="ghost" size="xs" className="shrink-0 text-muted hover:bg-tint hover:text-ink"
        aria-label="Dismiss notification" title="Dismiss" onClick={() => dismiss(toast.id)}>
        <X size={13} aria-hidden="true" />
      </IconButton>
    </div>
  </motion.article>;
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expandedByClick, setExpandedByClick] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const clocks = useRef(new Map<string, { version: number; remaining: number }>());
  const regionRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoreAfterDismiss = useRef<string | null>(null);
  const dismissWithFocus = useCallback((id: string) => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement &&
      activeElement.closest("[data-toast-id]")?.getAttribute("data-toast-id") === id) {
      restoreAfterDismiss.current = id;
    }
    dismiss(id);
  }, [dismiss]);
  const expanded = hovered || focused || expandedByClick;
  const paused = expanded || pageHidden;
  const active = toasts[0];

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    const live = new Set(toasts.map((toast) => toast.id));
    for (const id of clocks.current.keys()) if (!live.has(id)) clocks.current.delete(id);
    if (toasts.length === 0) setExpandedByClick(false);
  }, [toasts]);
  useEffect(() => {
    if (!active) return;
    const lifetime = clocks.current;
    let clock = lifetime.get(active.id);
    if (!clock || clock.version !== active.version) {
      clock = { version: active.version, remaining: active.duration };
      lifetime.set(active.id, clock);
    }
    if (paused || !Number.isFinite(clock.remaining)) return;
    const remaining = clock.remaining;
    if (remaining <= 0) { dismiss(active.id); return; }
    const started = performance.now();
    const handle = window.setTimeout(() => dismiss(active.id), remaining);
    return () => {
      window.clearTimeout(handle);
      const current = lifetime.get(active.id);
      if (current === clock) current.remaining = Math.max(0, remaining - (performance.now() - started));
    };
  }, [active, paused, dismiss]);

  useIsomorphicLayoutEffect(() => {
    const removedId = restoreAfterDismiss.current;
    if (!removedId) return;
    restoreAfterDismiss.current = null;
    const next = Array.from(regionRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-toast-id] button[aria-label="Dismiss notification"]',
    ) ?? []).find((button) => button.closest("[data-toast-id]")?.getAttribute("data-toast-id") !== removedId);
    if (next) next.focus();
    else if (returnFocus.current?.isConnected) returnFocus.current.focus();
  }, [toasts]);

  if (toasts.length === 0) return null;
  const visible = toasts.slice(0, MAX_VISIBLE_TOASTS);
  const hiddenCount = toasts.length - visible.length;

  return <section ref={regionRef} aria-label="Notifications"
    className="pointer-events-none fixed right-[max(14px,env(safe-area-inset-right))] bottom-[max(14px,env(safe-area-inset-bottom))] z-[var(--z-toast)] max-w-[min(360px,calc(100vw_-_28px))] max-[480px]:right-[max(12px,env(safe-area-inset-right))] max-[480px]:bottom-[max(12px,env(safe-area-inset-bottom))] max-[480px]:left-[max(12px,env(safe-area-inset-left))] max-[480px]:max-w-none">
    <div className="pointer-events-auto"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (event.relatedTarget instanceof HTMLElement &&
          !event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget;
        setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}>
      {toasts.length > 1 && <button type="button"
        className="mb-1.5 ml-auto block rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted hover:text-ink focus-visible:text-accent"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse notifications" : `Expand ${toasts.length} notifications`}
        onClick={() => setExpandedByClick((open) => !open)}>
        {expanded ? "Collapse" : `${toasts.length} notifications`}
        {hiddenCount > 0 ? ` · +${hiddenCount}` : ""}
      </button>}
      <div className="relative">
        {!expanded && visible.length > 1 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 -top-1.5 h-6 rounded-lg border border-line bg-surface" />}
        {!expanded && visible.length > 2 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-4 -top-3 h-6 rounded-lg border border-line bg-surface" />}
        <div className={cn("relative flex flex-col gap-1.5", expanded && "flex-col-reverse")}>
          <AnimatePresence initial={false} mode="popLayout">
            {(expanded ? visible : visible.slice(0, 1)).map((toast) =>
              <ToastCard key={toast.id} toast={toast} dismiss={dismissWithFocus} />)}
          </AnimatePresence>
        </div>
      </div>
    </div>
  </section>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
