import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const root = read("../../routes/__root.tsx");
const settings = read("./AppSettings.tsx");
const backup = read("../desktop-recovery/DesktopRecoveryTools.tsx");
const home = read("../../pages/home/HomePage.tsx");
const workspace = read("../../pages/workspace/WorkspacePage.tsx");
const lifecycle = read("../../adapters/browser/desktop-lifecycle.ts");

test("desktop backup is reachable through Settings, not a floating overlay", () => {
  assert.match(root, /<AppSettings \/>/);
  assert.doesNotMatch(root, /<DesktopRecoveryTools \/>/);
  assert.match(home, /<SettingsTrigger \/>/);
  assert.match(workspace, /<SettingsTrigger/);
  assert.match(settings, /OPEN_NOTESPACE_SETTINGS/);
  assert.match(settings, /Data &amp; backup/);
  assert.match(settings, /<DesktopRecoveryTools onBusyChange=\{onBusyChange\} \/>/);
  assert.match(settings, /data-notespace-settings-root/);
  assert.doesNotMatch(backup, /fixed left-4 bottom-4|setExpanded\(/);
});

test("backup settings keep safety boundary and prevent dismissal while saving", () => {
  assert.match(backup, /beginDesktopQuiescence\(\)/);
  assert.match(backup, /flushDesktopState\(\)/);
  assert.match(backup, /sealDesktopWrites\(\)/);
  assert.match(backup, /create_desktop_manual_backup/);
  assert.match(backup, /list_desktop_recovery_points/);
  assert.match(backup, /list_desktop_manual_backups/);
  assert.match(backup, /onBusyChange\(true\)/);
  assert.match(backup, /onBusyChange\(false\)/);
  assert.match(settings, /if \(!next && busyRef\.current\) return/);
  assert.match(settings, /if \(busyRef\.current\) event\.preventDefault\(\)/);
  assert.match(lifecycle, /\[data-notespace-settings-root\]/);
  assert.doesNotMatch(lifecycle, /\[aria-label="Desktop backup and recovery"\]/);
});
