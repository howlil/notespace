import * as ToastPrimitive from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { POPUP_OPEN_EVENT, requestExclusivePopup } from "../components/ui/dismissable";
import "./toast.css";

export type ToastKind = "success" | "error" | "info";
export type ToastAction = { label: string; onClick: () => void };
export type ToastInput = { message: string; kind?: ToastKind; action?: ToastAction; duration?: number };

type ToastItem = ToastInput & { id: number };
type ToastContextValue = { showToast: (input: ToastInput) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_TOAST_DURATION = 4200;

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
    <ToastPrimitive.Viewport className="toast-viewport" aria-label="Notifications">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            asChild
            open
            type="foreground"
            duration={toast.duration ?? DEFAULT_TOAST_DURATION}
            onOpenChange={(open) => { if (!open) dismiss(toast.id); }}
            className={`toast-root toast-${toast.kind ?? "info"}`}
          >
            <motion.li
              style={{ "--toast-duration": `${toast.duration ?? DEFAULT_TOAST_DURATION}ms` } as CSSProperties}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.16 }}
            >
              <span className="toast-icon" aria-hidden="true">
                {toast.kind === "error" ? <AlertCircle size={16} /> : toast.kind === "success" ? <CheckCircle2 size={16} /> : <Info size={16} />}
              </span>
              <ToastPrimitive.Description className="toast-message">{toast.message}</ToastPrimitive.Description>
              {toast.action && <ToastPrimitive.Action asChild altText={toast.action.label}><button type="button" className="toast-action" onClick={() => { toast.action?.onClick(); dismiss(toast.id); }}>{toast.action.label}</button></ToastPrimitive.Action>}
              <ToastPrimitive.Close asChild><button type="button" className="toast-close" aria-label="Dismiss notification"><X size={14} /></button></ToastPrimitive.Close>
              <span className="toast-progress" aria-hidden="true" />
            </motion.li>
          </ToastPrimitive.Root>
        ))}
      </AnimatePresence>
    </ToastPrimitive.Viewport>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
