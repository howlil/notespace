import { Link } from "@tanstack/react-router";
import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NotespaceLogo } from "../../../shared/ui/brand/NotespaceLogo";
import { WindowControls } from "./WindowControls";

export function DesktopTitleBar({
  active,
  headerHostRef,
}: {
  active: boolean;
  headerHostRef: (element: HTMLElement | null) => void;
}) {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    let mounted = true;
    let unlistenFocus: (() => void) | undefined;

    void currentWindow.isFocused()
      .then((value) => { if (mounted) setFocused(value); })
      .catch(() => {});
    void currentWindow.onFocusChanged(({ payload }) => {
      if (mounted) setFocused(payload);
    }).then((unlisten) => {
      if (mounted) unlistenFocus = unlisten;
      else unlisten();
    }).catch(() => {});

    return () => {
      mounted = false;
      unlistenFocus?.();
    };
  }, []);

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("a, button, input, select, textarea, .desktop-window-controls")) return;
    void getCurrentWindow().toggleMaximize();
  }

  return (
    <div
      className={["desktop-titlebar", active && focused ? "" : "desktop-titlebar--inactive"].filter(Boolean).join(" ")}
      onDoubleClick={handleDoubleClick}
    >
      {(
        <div className="desktop-titlebar-brand" data-tauri-drag-region>
          <Link to="/" aria-label="Notespace home"><NotespaceLogo size="sm" gap="sm" className="desktop-titlebar-brand-label" markClassName="desktop-titlebar-mark" /></Link>
        </div>
      )}
      <div ref={headerHostRef} className="desktop-titlebar-header-slot" data-tauri-drag-region />
      <WindowControls />
    </div>
  );
}
