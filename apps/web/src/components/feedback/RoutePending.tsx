import { NotespaceLogo } from "../brand/NotespaceLogo";

export function RoutePending() {
  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background"
      role="status"
      aria-label="Loading Notespace"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Preparing your workspace</span>
      <span className="grid place-items-center transition-transform duration-300 ease-out hover:scale-[1.06]" aria-hidden="true">
        <NotespaceLogo
          showWordmark={false}
          size="md"
          markClassName="!size-[clamp(72px,10vw,112px)] animate-loading-logo"
        />
      </span>
    </main>
  );
}
