export type ToastKind = "success" | "info" | "warning" | "error" | "loading";
export type ToastAction = {
  label: string;
  onClick: () => void;
  /** Keep a retry toast visible while the operation resolves. */
  dismissOnClick?: boolean;
};
export type ToastInput = {
  message: string;
  description?: string;
  kind?: ToastKind;
  action?: ToastAction;
  duration?: number;
  id?: string;
};
export type ToastPatch = Partial<Omit<ToastInput, "id">>;
export type ToastItem = Omit<ToastInput, "kind" | "duration"> & {
  id: string;
  kind: ToastKind;
  duration: number;
  version: number;
};
export const MAX_VISIBLE_TOASTS = 3;
export const MAX_QUEUED_TOASTS = 8;

export function toastDuration(kind: ToastKind, action?: ToastAction): number {
  if (kind === "loading" || (kind === "error" && action)) return Infinity;
  if (kind === "error") return 8000;
  if (kind === "warning") return 7000;
  return 4200;
}

export function updateToastItem(items: ToastItem[], id: string, patch: ToastPatch): ToastItem[] {
  if (!items.some((item) => item.id === id)) return items;
  return items.map((item) => {
    if (item.id !== id) return item;
    const kind = patch.kind ?? item.kind;
    const action = Object.prototype.hasOwnProperty.call(patch, "action") ? patch.action : item.action;
    const duration = patch.duration ?? (
      patch.kind !== undefined || Object.prototype.hasOwnProperty.call(patch, "action")
        ? toastDuration(kind, action) : item.duration
    );
    return { ...item, ...patch, kind, action, duration, version: item.version + 1 };
  });
}

export function enqueueToast(items: ToastItem[], input: ToastInput, id: string): ToastItem[] {
  if (items.some((item) => item.id === id)) return updateToastItem(items, id, input);
  const kind = input.kind ?? "info";
  const item: ToastItem = {
    ...input, id, kind, duration: input.duration ?? toastDuration(kind, input.action), version: 0,
  };
  return [item, ...items].slice(0, MAX_QUEUED_TOASTS);
}
