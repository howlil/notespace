import assert from "node:assert/strict";
import test from "node:test";
import { isExpectedNativeCloseDisconnect } from "./native-close-session.mjs";

test("recognize WebView2 teardown only when EdgeDriver reports last-window disconnection", () => {
  assert.equal(isExpectedNativeCloseDisconnect(new Error(
    "disconnected: not connected to DevTools\n  (failed to check if window was closed: disconnected: not connected to DevTools)\n  (Session info: MicrosoftEdge=131.0.2903.86)",
  )), true);
  for (const message of [
    "no such window: target window already closed",
    "invalid session id",
    "target window already closed",
  ]) assert.equal(isExpectedNativeCloseDisconnect(new Error(message)), true, message);
});

test("never swallow driver failures unrelated to an already closing native window", () => {
  for (const message of [
    "session not created: DevToolsActivePort file doesn't exist",
    "disconnected: not connected to DevTools",
    "unknown error: javascript exception",
    "Command request_desktop_close not allowed by ACL",
    "Notespace refused to close because the durability flush failed",
    "timeout waiting for WebView2",
    "invalid argument",
  ]) assert.equal(isExpectedNativeCloseDisconnect(new Error(message)), false, message);
});
