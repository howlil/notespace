import type { ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { MenuItem, MenuSection } from "../../../shared/ui";
import { nativeActionIcon } from "../core/excalidraw-bridge/CanvasNativeActions";

export const motionTransition = { duration: 0.16, ease: "easeOut" } as const;

export function MenuAction({
  api,
  nativeAction,
  label,
  shortcut,
  fallbackIcon,
  danger = false,
  onClick,
}: {
  api: ExcalidrawImperativeAPI | null;
  nativeAction?: string;
  label: string;
  shortcut?: string;
  fallbackIcon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  const icon = nativeActionIcon(api, nativeAction) ?? fallbackIcon;
  return (
    <MenuItem
      role="button"
      icon={icon}
      label={label}
      shortcut={shortcut}
      danger={danger}
      className="min-h-[30px] gap-2.5 px-2.5 text-[12.5px]"
      onClick={onClick}
    />
  );
}

export { MenuSection };
