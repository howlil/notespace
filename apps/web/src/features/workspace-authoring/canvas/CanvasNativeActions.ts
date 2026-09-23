import type { ReactNode } from "react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

type SceneElements = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>;
type ActionWithIcon = {
  icon?: ReactNode | ((appState: AppState, elements: SceneElements) => ReactNode);
};
type ActionManagerAdapter = {
  actions: Record<string, ActionWithIcon>;
  executeAction: (action: unknown, source: "ui", value?: unknown) => void;
};

// Excalidraw exposes scene/tool mutation through its imperative API, but its
// action registry and action icons are still internal implementation details.
// Keep that single private compatibility boundary here so Canvas chrome does
// not grow several independent casts/fallback icon systems.
function actionManager(api: ExcalidrawImperativeAPI): ActionManagerAdapter {
  return api.app.actionManager as unknown as ActionManagerAdapter;
}

export function nativeActionIcon(api: ExcalidrawImperativeAPI | null, name?: string): ReactNode {
  if (!api || !name) return null;
  const icon = actionManager(api).actions[name]?.icon;
  if (!icon) return null;
  return typeof icon === "function" ? icon(api.getAppState(), api.getSceneElements()) : icon;
}

export function executeNativeAction(api: ExcalidrawImperativeAPI, name: string, value?: unknown): boolean {
  const manager = actionManager(api);
  const action = manager.actions[name];
  if (!action) return false;
  manager.executeAction(action, "ui", value);
  return true;
}
