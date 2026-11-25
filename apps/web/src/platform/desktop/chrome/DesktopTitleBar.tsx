import { useEffect, useState, type MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DesktopPlatform } from "./desktop-platform";
import { WindowControls } from "./WindowControls";

export function DesktopTitleBar({
  active,
  platform,
}: {
  active: boolean;
  platform: DesktopPlatform;
}) {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  if (!active) return null;

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("a, button, input, select, textarea, .desktop-window-controls")) return;
    void getCurrentWindow().toggleMaximize();
  }

  return (
    <>
      <div className="desktop-drag-strip" data-tauri-drag-region onDoubleClick={handleDoubleClick} />
      <WindowControls variant={platform} focused={focused} />
    </>
  );
}
