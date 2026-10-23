import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, IconButton, cn } from ".";
import { enqueueToast, MAX_VISIBLE_TOASTS, updateToastItem } from "./toast-state";
import type { ToastInput, ToastItem, ToastKind, ToastPatch } from "./toast-state";

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
  const className = cn("mt-0.5 shrink-0",
    kind === "error" ? "text-danger" : kind === "success" ? "text-success" :
    kind === "warning" ? "text-warning" : "text-accent");
  if (kind === "loading") return <LoaderCircle size={18} className={cn(className, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />;
  if (kind === "error") return <AlertCircle size={18} className={className} aria-hidden="true" />;
  if (kind === "warning") return <AlertTriangle size={18} className={className} aria-hidden="true" />;
  if (kind === "success") return <CheckCircle2 size={18} className={className} aria-hidden="true" />;
  return <Info size={18} className={className} aria-hidden="true" />;
}

function ToastCard({ toast, dismiss }: { toast: ToastItem; dismiss: (id: string) => void }) {
  const kind = toast.kind;
  return <motion.article
    layout
    role={kind === "error" ? "alert" : "status"}
    aria-live={kind === "error" ? "assertive" : "polite"}
    aria-atomic="true"
    initial={{ opacity: 0, y: 10, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 7, scale: 0.98 }}
    transition={{ duration: 0.16, ease: "easeOut" }}
    className="pointer-events-auto relative flex min-w-0 items-start gap-3 rounded-lg border border-line bg-surface px-3 py-3 text-ink shadow-[var(--shadow-popup)]"
  >
    <ToastGlyph kind={kind} />
    <div className="min-w-0 flex-1">
      <p className="m-0 break-words text-xs font-semibold leading-[1.5]">{toast.message}</p>
      {toast.description && <p className="m-0 mt-0.5 break-words text-[11px] leading-[1.55] text-muted">{toast.description}</p>}
      {toast.action && <Button
        type="button" variant="ghost" size="sm"
        className="mt-1.5 min-h-7 border border-line px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-tint"
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
    </div>
    <IconButton type="button" variant="ghost" className="!size-7 shrink-0 text-muted hover:bg-tint hover:text-ink"
      aria-label="Dismiss notification" title="Dismiss" onClick={() => dismiss(toast.id)}>
      <X size={15} aria-hidden="true" />
    </IconButton>
  </motion.article>;
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expandedByClick, setExpandedByClick] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const clocks = useRef(new Map<string, { version: number; remaining: number }>());
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
    let clock = clocks.current.get(active.id);
    if (!clock || clock.version !== active.version) {
      clock = { version: active.version, remaining: active.duration };
      clocks.current.set(active.id, clock);
    }
    if (paused || !Number.isFinite(clock.remaining)) return;
    const remaining = clock.remaining;
    if (remaining <= 0) { dismiss(active.id); return; }
    const started = performance.now();
    const handle = window.setTimeout(() => dismiss(active.id), remaining);
    return () => {
      window.clearTimeout(handle);
      const current = clocks.current.get(active.id);
      if (current === clock) current.remaining = Math.max(0, remaining - (performance.now() - started));
    };
  }, [active, paused, dismiss]);

  if (toasts.length === 0) return null;
  const visible = toasts.slice(0, MAX_VISIBLE_TOASTS);
  const hiddenCount = toasts.length - visible.length;

  return <section aria-label="Notifications"
    className="pointer-events-none fixed right-[max(16px,env(safe-area-inset-right))] bottom-[max(16px,env(safe-area-inset-bottom))] z-[200] w-[min(360px,calc(100vw_-_32px))] max-[480px]:right-[max(12px,env(safe-area-inset-right))] max-[480px]:bottom-[max(12px,env(safe-area-inset-bottom))] max-[480px]:left-[max(12px,env(safe-area-inset-left))] max-[480px]:w-auto">
    <div className="pointer-events-auto"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}>
      {toasts.length > 1 && <button type="button"
        className="mb-2 ml-auto block rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-muted shadow-sm hover:text-ink focus-visible:text-accent"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse notifications" : `Expand ${toasts.length} notifications`}
        onClick={() => setExpandedByClick((open) => !open)}>
        {expanded ? "Collapse notifications" : `${toasts.length} notifications`}
        {hiddenCount > 0 ? ` · +${hiddenCount} queued` : ""}
      </button>}
      <div className="relative">
        {!expanded && visible.length > 1 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 -top-3 h-10 rounded-lg border border-line bg-surface shadow-sm" />}
        {!expanded && visible.length > 2 && <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 -top-6 h-10 rounded-lg border border-line bg-surface shadow-sm" />}
        <div className={cn("relative flex flex-col gap-2", expanded && "flex-col-reverse")}>
          <AnimatePresence initial={false} mode="popLayout">
            {(expanded ? visible : visible.slice(0, 1)).map((toast) =>
              <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />)}
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
