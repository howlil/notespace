import { useRouterState } from "@tanstack/react-router";
import { NotespaceLogo } from "../NotespaceLogo";
import { WindowControls } from "./WindowControls";

export function DesktopTitleBar({
  active,
  headerHostRef,
}: {
  active: boolean;
  headerHostRef: (element: HTMLElement | null) => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isWorkspace = pathname.startsWith("/workspaces/");

  return (
    <div className={active ? "desktop-titlebar" : "desktop-titlebar desktop-titlebar--inactive"}>
      {!isWorkspace && (
        <div className="desktop-titlebar-brand" data-tauri-drag-region>
          <NotespaceLogo size="sm" gap="sm" className="desktop-titlebar-brand-label" markClassName="desktop-titlebar-mark" />
        </div>
      )}
      <div ref={headerHostRef} className="desktop-titlebar-header-slot" data-tauri-drag-region />
      <WindowControls />
    </div>
  );
}
