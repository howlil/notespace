import type { Ref } from "react";
import { Input } from "../../shared/ui";

export function WorkspaceRenameField({
  inputRef,
  value,
  disabled,
  onChange,
  onCommit,
  onCancel,
}: {
  inputRef: Ref<HTMLInputElement>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <Input
      ref={inputRef}
      className="h-7 w-full rounded-none border-0 bg-transparent px-1.5 text-[12px] font-medium focus:border-transparent focus:ring-0"
      aria-label="Workspace title"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => void onCommit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void onCommit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
