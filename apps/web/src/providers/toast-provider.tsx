import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Button, cn, IconButton } from "../components/ui";
import { POPUP_OPEN_EVENT, requestExclusivePopup } from "../components/ui/dismissable";

export type ToastKind = "success" | "error" | "info";
export type ToastAction = { label: string; onClick: () => void };
export type ToastInput = { message: string; kind?: ToastKind; action?: ToastAction; duration?: number };

type ToastItem = ToastInput & { id: number };
type ToastContextValue = { showToast: (input: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_TOAST_DURATION = 4200;

const kindStyles: Record<ToastKind, { label: string; root: string; icon: string; progress: string }> = {
  info: {
    label: "Notice",
    root: "before:bg-accent",
    icon: "bg-tint text-accent",
    progress: "bg-accent",
  },
  error: {
    label: "Error",
    root: "before:bg-danger",
    icon: "bg-tint text-danger",
    progress: "bg-danger",
  },
  success: {
    label: "Done",
    root: "before:bg-success",
    icon: "bg-tint text-success",
    progress: "bg-success",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  useEffect(() => {
    const closeToastWhenAnotherPopupOpens = () => setToasts([]);
    document.addEventListener(POPUP_OPEN_EVENT, closeToastWhenAnotherPopupOpens);
    return () => document.removeEventListener(POPUP_OPEN_EVENT, closeToastWhenAnotherPopupOpens);
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const toast = { ...input, id: Date.now() + Math.random() };
    requestExclusivePopup();
    setToasts([toast]);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  const activeToastId = toasts[0]?.id;
  const activeToastDuration = toasts[0]?.duration;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(false);
  }, [activeToastId]);

  useEffect(() => {
    if (activeToastId === undefined || paused) return;

    const duration = activeToastDuration ?? DEFAULT_TOAST_DURATION;
    if (!Number.isFinite(duration)) return;
    if (duration <= 0) {
      dismiss(activeToastId);
      return;
    }

    const timeoutId = window.setTimeout(() => dismiss(activeToastId), duration);
    return () => window.clearTimeout(timeoutId);
  }, [activeToastDuration, activeToastId, dismiss, paused]);

  return (
    <div
      className="pointer-events-none fixed right-[max(16px,env(safe-area-inset-right))] bottom-[max(16px,env(safe-area-inset-bottom))] z-[200] m-0 flex w-[min(360px,calc(100vw_-_32px))] flex-col gap-2 outline-none max-[480px]:right-[max(12px,env(safe-area-inset-right))] max-[480px]:bottom-[max(12px,env(safe-area-inset-bottom))] max-[480px]:left-3 max-[480px]:w-auto"
      aria-label="Notifications"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const kind = toast.kind ?? "info";
          const styles = kindStyles[kind];
          const duration = toast.duration ?? DEFAULT_TOAST_DURATION;
          const progressDuration = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_TOAST_DURATION;

          return (
            <motion.article
              key={toast.id}
              layout
              role={kind === "error" ? "alert" : "status"}
              aria-live={kind === "error" ? "assertive" : "polite"}
              aria-atomic="true"
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={cn(
                "pointer-events-auto relative grid min-h-14 grid-cols-[28px_minmax(0,1fr)_24px] gap-x-2 overflow-hidden rounded-lg border border-line bg-surface px-3 py-2.5 text-ink shadow-[0_12px_32px_#0002] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-['']",
                styles.root,
              )}
            >
              <span className={cn("row-span-2 mt-0.5 grid size-7 place-items-center rounded-md", styles.icon)} aria-hidden="true">
                {kind === "error" ? <AlertCircle size={16} /> : kind === "success" ? <CheckCircle2 size={16} /> : <Info size={16} />}
              </span>
              <div className="min-w-0 self-center">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{styles.label}</p>
                <p className="m-0 mt-0.5 text-xs font-medium leading-[1.35] text-ink">{toast.message}</p>
              </div>
              <IconButton type="button" variant="ghost" className="row-start-1 !size-6 justify-self-end self-start text-muted hover:bg-tint hover:text-ink focus-visible:bg-tint focus-visible:text-ink" aria-label="Dismiss notification" title="Dismiss" onClick={() => dismiss(toast.id)}>
                <X size={14} />
              </IconButton>
              {toast.action && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="col-start-2 min-h-0 justify-self-start border-0 px-0 py-0.5 text-[11px] font-semibold text-accent hover:text-ink focus-visible:text-ink"
                  onClick={() => { toast.action?.onClick(); dismiss(toast.id); }}
                >
                  {toast.action.label}
                </Button>
              )}
              <span
                className={cn("absolute right-0 bottom-0 left-0 h-0.5 origin-left animate-toast-progress opacity-50 motion-reduce:animate-none", styles.progress)}
                style={{
                  "--toast-duration": `${progressDuration}ms`,
                  animationPlayState: paused ? "paused" : "running",
                } as CSSProperties}
                aria-hidden="true"
              />
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
