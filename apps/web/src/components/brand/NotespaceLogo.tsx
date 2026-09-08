import { cn } from "../ui";
import { useTheme } from "../../providers/theme-provider";

type LogoSize = "sm" | "md";
type LogoGap = "sm" | "md";

type Props = {
  className?: string;
  markClassName?: string;
  size?: LogoSize;
  gap?: LogoGap;
  showWordmark?: boolean;
};

const sizeClasses: Record<LogoSize, string> = {
  sm: "size-6",
  md: "size-8",
};

const gapClasses: Record<LogoGap, string> = {
  sm: "gap-[9px]",
  md: "gap-2",
};

export function NotespaceLogo({
  className,
  markClassName,
  size = "sm",
  gap = "md",
  showWordmark = true,
}: Props) {
  const { dark } = useTheme();

  return (
    <span className={cn("inline-flex items-center text-lg font-semibold tracking-[-.7px] text-ink", gapClasses[gap], className)}>
      <img
        src={dark ? "/brand/notespace-foldling-light.svg" : "/brand/notespace-foldling.svg"}
        alt=""
        aria-hidden="true"
        className={cn("block shrink-0 object-contain", sizeClasses[size], markClassName)}
      />
      {showWordmark && <span>notespace</span>}
    </span>
  );
}
