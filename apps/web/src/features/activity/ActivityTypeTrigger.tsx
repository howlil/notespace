import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play } from "lucide-react";
import { IconButton } from "../../shared/ui";
import { useAnchoredPanelDismiss, useAnchoredPanelPosition } from "../../shared/ui/anchored-panel";
import type { ActivityType } from "../../adapters/http/activity-api";
import { ActivityTypeMenu } from "./ActivityTypeMenu";

export function ActivityTypeTrigger({
  ariaLabel,
  disabled,
  disabledTitle = "End the active activity first",
  onSelect,
}: {
  ariaLabel: string;
  disabled: boolean;
  disabledTitle?: string;
  onSelect: (activityType: ActivityType) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanelPosition(anchorRef, menuRef, open, 176, 232);

  useAnchoredPanelDismiss(open, menuRef, anchorRef, () => setOpen(false));
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={anchorRef} className="relative">
      <IconButton
        className="!size-7 text-muted hover:text-accent"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? disabledTitle : "Start activity"}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <Play size={13} />
      </IconButton>
      {open && typeof document !== "undefined" && createPortal(
        <ActivityTypeMenu
          ref={menuRef}
          className="fixed"
          style={position
            ? { top: position.top, left: position.left }
            : { visibility: "hidden" }}
          onSelect={(activityType) => {
            setOpen(false);
            onSelect(activityType);
          }}
        />,
        document.body,
      )}
    </div>
  );
}
