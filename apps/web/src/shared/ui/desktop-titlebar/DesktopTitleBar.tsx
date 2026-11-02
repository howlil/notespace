import { Link } from "@tanstack/react-router";
import { NotespaceLogo } from "../NotespaceLogo";
import { WindowControls } from "./WindowControls";

export function DesktopTitleBar({
  active,
  headerHostRef,
}: {
  active: boolean;
  headerHostRef: (element: HTMLElement | null) => void;
}) {

  return (
    <div className={active ? "desktop-titlebar" : "desktop-titlebar desktop-titlebar--inactive"}>
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
