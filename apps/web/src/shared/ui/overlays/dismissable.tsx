import { useEffect, useRef, type RefObject } from "react";

const POPUP_OPEN_EVENT = "notespace:popup-open";

type DismissableRef = RefObject<HTMLElement | null>;
const popupClosers = new Map<symbol, () => void>();

function requestExclusivePopup(owner?: symbol) {
  popupClosers.forEach((close, token) => {
    if (token !== owner) close();
  });
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent(POPUP_OPEN_EVENT, { detail: { owner } }));
  }
}

function usePopupRegistration(onDismiss: () => void) {
  const tokenRef = useRef<symbol | null>(null);
  const dismissRef = useRef(onDismiss);
  if (!tokenRef.current) tokenRef.current = Symbol("popup");
  dismissRef.current = onDismiss;

  useEffect(() => {
    const token = tokenRef.current!;
    popupClosers.set(token, () => dismissRef.current());
    return () => { popupClosers.delete(token); };
  }, []);

  return tokenRef.current!;
}

export function useExclusivePopup(open: boolean, onDismiss: () => void) {
  const token = usePopupRegistration(onDismiss);
  useEffect(() => {
    if (open) requestExclusivePopup(token);
  }, [open, token]);
}

export function useDismissablePopup(ref: DismissableRef, open: boolean, onDismiss: () => void, additionalRefs: readonly DismissableRef[] = []) {
  useExclusivePopup(open, onDismiss);

  useEffect(() => {
    if (!open) return;

    function dismissOnOutsideInteraction(event: PointerEvent | FocusEvent) {
      const target = event.target;
      if (target instanceof Node && (ref.current?.contains(target) || additionalRefs.some((additionalRef) => additionalRef.current?.contains(target)))) return;
      onDismiss();
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    document.addEventListener("pointerdown", dismissOnOutsideInteraction, true);
    document.addEventListener("focusin", dismissOnOutsideInteraction, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsideInteraction, true);
      document.removeEventListener("focusin", dismissOnOutsideInteraction, true);
      document.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [additionalRefs, onDismiss, open, ref]);
}
