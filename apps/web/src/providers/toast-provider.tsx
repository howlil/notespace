import * as ToastPrimitive from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../components/ui";
import { POPUP_OPEN_EVENT, requestExclusivePopup } from "../components/ui/dismissable";

export type ToastKind = "success" | "error" | "info";
export type ToastAction = { label: string; onClick: () => void };
export type ToastInput = { message: string; kind?: ToastKind; action?: ToastAction; duration?: number };

type ToastItem = ToastInput & { id: number };
type ToastContextValue = { showToast: (input: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_TOAST_DURATION = 4200;

const kindStyles: Record<ToastKind, { root: string; icon: string; progress: string }> = {
  info: {
    root: "before:bg-accent",
    icon: "bg-tint text-accent",
    progress: "bg-accent",
  },
  error: {
    root: "before:bg-danger",
    icon: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
    progress: "bg-danger",
  },
  success: {
    root: "before:bg-success",
    icon: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success",
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
      <ToastPrimitive.Provider label="Notifications" swipeDirection="right">
        {children}
        <ToastViewport toasts={toasts} dismiss={dismiss} />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  const activeToastId = toasts[0]?.id;
  const activeToastDuration = toasts[0]?.duration;

  useEffect(() => {
    if (activeToastId === undefined) return;

    const duration = activeToastDuration ?? DEFAULT_TOAST_DURATION;
    if (!Number.isFinite(duration)) return;
    if (duration <= 0) {
      dismiss(activeToastId);
      return;
    }

    const timeoutId = window.setTimeout(() => dismiss(activeToastId), duration);
    return () => window.clearTimeout(timeoutId);
  }, [activeToastDuration, activeToastId, dismiss]);

  return (
    <ToastPrimitive.Viewport
      className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[max(16px,env(safe-area-inset-bottom))] z-[200] m-0 flex w-[min(336px,calc(100vw_-_32px))] list-none flex-col gap-1.5 p-0 outline-none max-[480px]:right-[max(12px,env(safe-area-inset-right))] max-[480px]:bottom-[max(12px,env(safe-area-inset-bottom))] max-[480px]:left-3 max-[480px]:w-auto"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const kind = toast.kind ?? "info";
          const styles = kindStyles[kind];
          return (
            <ToastPrimitive.Root
              key={toast.id}
              asChild
              open
              type="foreground"
              duration={toast.duration ?? DEFAULT_TOAST_DURATION}
              onOpenChange={(open) => { if (!open) dismiss(toast.id); }}
              className={cn(
                "relative grid min-h-12 grid-cols-[20px_minmax(0,1fr)_24px] grid-rows-[auto_auto] gap-x-2 gap-y-[5px] overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--line)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] py-[10px] pr-[9px] pb-[11px] pl-[11px] text-ink shadow-[0_14px_34px_#0000001c,0_2px_8px_#0000000c] backdrop-blur-[12px] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
                styles.root,
              )}
            >
              <motion.li
                style={{ "--toast-duration": `${toast.duration ?? DEFAULT_TOAST_DURATION}ms` } as CSSProperties}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={{ duration: 0.16 }}
              >
                <span className={cn("col-start-1 row-span-2 row-start-1 mt-px grid size-5 place-items-center rounded-md", styles.icon)} aria-hidden="true">
                  {kind === "error" ? <AlertCircle size={16} /> : kind === "success" ? <CheckCircle2 size={16} /> : <Info size={16} />}
                </span>
                <ToastPrimitive.Description className="col-start-2 row-start-1 min-w-0 self-center text-xs font-medium leading-[1.35] text-ink">{toast.message}</ToastPrimitive.Description>
                {toast.action && (
                  <ToastPrimitive.Action asChild altText={toast.action.label}>
                    <button
                      type="button"
                      className="col-span-2 col-start-2 row-start-2 justify-self-start border-0 bg-transparent pt-px text-[11px] font-semibold text-accent hover:text-ink focus-visible:text-ink"
                      onClick={() => { toast.action?.onClick(); dismiss(toast.id); }}
                    >
                      {toast.action.label}
                    </button>
                  </ToastPrimitive.Action>
                )}
                <ToastPrimitive.Close asChild>
                  <button type="button" className="col-start-3 row-start-1 grid size-6 place-items-center justify-self-end rounded-md border-0 bg-transparent text-muted hover:bg-tint hover:text-ink focus-visible:bg-tint focus-visible:text-ink" aria-label="Dismiss notification"><X size={14} /></button>
                </ToastPrimitive.Close>
                <span className={cn("absolute right-0 bottom-0 left-0 h-0.5 origin-left animate-toast-progress opacity-40 motion-reduce:animate-none", styles.progress)} aria-hidden="true" />
              </motion.li>
            </ToastPrimitive.Root>
          );
        })}
      </AnimatePresence>
    </ToastPrimitive.Viewport>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
