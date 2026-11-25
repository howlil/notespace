import { createContext, useContext, type ReactNode } from "react";
import type { CanvasController } from "./canvas-controller";

const CanvasControllerContext = createContext<CanvasController | null>(null);

export function CanvasControllerProvider({
  controller,
  children,
}: {
  controller: CanvasController;
  children: ReactNode;
}) {
  return (
    <CanvasControllerContext.Provider value={controller}>
      {children}
    </CanvasControllerContext.Provider>
  );
}

export function useCanvasController(): CanvasController {
  const controller = useContext(CanvasControllerContext);
  if (!controller) {
    throw new Error("useCanvasController must be used within a CanvasControllerProvider.");
  }
  return controller;
}
