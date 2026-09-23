import { useEffect, useRef, type ReactNode, type RefObject } from "react";

export const CLOSE_POPUPS_EVENT = "notespace:close-popups";
export const POPUP_OPEN_EVENT = "notespace:popup-open";

type DismissableRef = RefObject<HTMLElement | null>;
const popupClosers = new Map<symbol, () => void>();

export function requestExclusivePopup(owner?: symbol) {
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

export function useDismissablePopup(ref: DismissableRef, open: boolean, onDismiss: () => void) {
  useExclusivePopup(open, onDismiss);

  useEffect(() => {
    if (!open) return;

    function dismissOnOutsideInteraction(event: PointerEvent | FocusEvent) {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
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
  }, [onDismiss, open, ref]);
}

export function NativePopupManager({ children }: { children: ReactNode }) {
  useEffect(() => {
    function closeDetails(except?: HTMLDetailsElement) {
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (details !== except) details.open = false;
      });
    }

    function handlePopupOpened(event: Event) {
      const owner = (event as CustomEvent<{ owner?: unknown }>).detail?.owner;
      const nativeOwner = owner instanceof HTMLDetailsElement ? owner : undefined;
      if (nativeOwner) popupClosers.forEach((close) => close());
      closeDetails(nativeOwner);
    }

    function handleCloseRequest() {
      closeDetails();
    }

    function handleNativePopupToggle(event: Event) {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      popupClosers.forEach((close) => close());
      document.dispatchEvent(new CustomEvent(POPUP_OPEN_EVENT, { detail: { owner: details } }));
    }

    function closeDetailsOnOutsideInteraction(event: PointerEvent | FocusEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (!details.contains(target)) details.open = false;
      });
    }

    function closeDetailsAfterAction(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("summary")) return;
      target.closest("details")?.removeAttribute("open");
    }

    document.addEventListener(CLOSE_POPUPS_EVENT, handleCloseRequest);
    document.addEventListener(POPUP_OPEN_EVENT, handlePopupOpened);
    document.addEventListener("toggle", handleNativePopupToggle, true);
    document.addEventListener("pointerdown", closeDetailsOnOutsideInteraction, true);
    document.addEventListener("focusin", closeDetailsOnOutsideInteraction, true);
    document.addEventListener("click", closeDetailsAfterAction, true);
    return () => {
      document.removeEventListener(CLOSE_POPUPS_EVENT, handleCloseRequest);
      document.removeEventListener(POPUP_OPEN_EVENT, handlePopupOpened);
      document.removeEventListener("toggle", handleNativePopupToggle, true);
      document.removeEventListener("pointerdown", closeDetailsOnOutsideInteraction, true);
      document.removeEventListener("focusin", closeDetailsOnOutsideInteraction, true);
      document.removeEventListener("click", closeDetailsAfterAction, true);
    };
  }, []);

  return children;
}
