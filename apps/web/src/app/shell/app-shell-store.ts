import { createStore } from "../../shared/lib/store.ts";

export type SettingsTab = "general" | "data";

export interface AppShellState {
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  quickOpen: boolean;
  workspaceMapOpen: boolean;
  canvasFullMode: boolean;
}

const initialAppShellState: AppShellState = {
  settingsOpen: false,
  settingsTab: "general",
  quickOpen: false,
  workspaceMapOpen: false,
  canvasFullMode: false,
};

export const appShellStore = createStore<AppShellState>(initialAppShellState);

export function openAppSettings(tab: SettingsTab = "general") {
  appShellStore.setState((current) => ({
    ...current,
    settingsOpen: true,
    settingsTab: tab,
  }));
}

export function setAppSettingsOpen(open: boolean) {
  appShellStore.setState((current) => (
    current.settingsOpen === open ? current : { ...current, settingsOpen: open }
  ));
}

export function setAppSettingsTab(tab: SettingsTab) {
  appShellStore.setState((current) => (
    current.settingsTab === tab ? current : { ...current, settingsTab: tab }
  ));
}

export function openQuickOpen() {
  appShellStore.setState((current) => (
    current.quickOpen ? current : { ...current, quickOpen: true }
  ));
}

export function setQuickOpen(open: boolean) {
  appShellStore.setState((current) => (
    current.quickOpen === open ? current : { ...current, quickOpen: open }
  ));
}

export function openWorkspaceMap() {
  appShellStore.setState((current) => (
    current.workspaceMapOpen ? current : { ...current, workspaceMapOpen: true }
  ));
}

export function setWorkspaceMapOpen(open: boolean) {
  appShellStore.setState((current) => (
    current.workspaceMapOpen === open ? current : { ...current, workspaceMapOpen: open }
  ));
}

export function setCanvasFullMode(next: boolean) {
  appShellStore.setState((current) => (
    current.canvasFullMode === next ? current : { ...current, canvasFullMode: next }
  ));
}

export function toggleCanvasFullMode() {
  appShellStore.setState((current) => ({
    ...current,
    canvasFullMode: !current.canvasFullMode,
  }));
}

export function resetAppShellStore() {
  appShellStore.setState(initialAppShellState);
}
