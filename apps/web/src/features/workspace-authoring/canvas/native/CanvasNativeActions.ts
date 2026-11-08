import type { ReactNode } from "react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

type SceneElements = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>;
type ActionWithIcon = {
  icon?: ReactNode | ((appState: AppState, elements: SceneElements) => ReactNode);
  predicate?: (elements: ReturnType<ExcalidrawImperativeAPI["getSceneElementsIncludingDeleted"]>, appState: AppState,
    props: ExcalidrawImperativeAPI["app"]["props"], app: ExcalidrawImperativeAPI["app"]) => boolean;
  perform?: (...args: unknown[]) => unknown;
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

export function nativeActionAvailable(api: ExcalidrawImperativeAPI, name: string): boolean {
  const action = actionManager(api).actions[name];
  return Boolean(action && (!action.predicate || action.predicate(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.app.props, api.app)));
}

export type NativeImageExportAction = "imageExport" | "copyAsPng" | "copyAsSvg";
type NativeImageExportCallbackArgs = Parameters<ExcalidrawImperativeAPI["app"]["onExportImage"]>;

export function interceptNativeImageExportActions(
  api: ExcalidrawImperativeAPI,
  intercept: (name: NativeImageExportAction) => boolean,
) {
  const actions = actionManager(api).actions;
  const originals = new Map<NativeImageExportAction, ActionWithIcon["perform"]>();
  const wrappers = new Map<NativeImageExportAction, NonNullable<ActionWithIcon["perform"]>>();

  for (const name of ["imageExport", "copyAsPng", "copyAsSvg"] as const) {
    const action = actions[name];
    if (!action?.perform) continue;
    const original = action.perform;
    const wrapper: NonNullable<ActionWithIcon["perform"]> = function (this: unknown, ...args: unknown[]) {
      if (intercept(name)) return false;
      return original.apply(this, args);
    };
    originals.set(name, original);
    wrappers.set(name, wrapper);
    action.perform = wrapper;
  }

  return () => {
    for (const [name, wrapper] of wrappers) {
      const action = actions[name];
      if (action?.perform === wrapper) action.perform = originals.get(name);
    }
  };
}

export function interceptNativeImageExportCallback(
  api: ExcalidrawImperativeAPI,
  intercept: (...args: NativeImageExportCallbackArgs) => boolean | Promise<boolean>,
) {
  const app = api.app;
  const original = app.onExportImage;
  const wrapper: typeof original = async (...args) => {
    if (await intercept(...args)) return;
    return original.call(app, ...args);
  };
  app.onExportImage = wrapper;
  return () => {
    if (app.onExportImage === wrapper) app.onExportImage = original;
  };
}
