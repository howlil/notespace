import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDesktopPlatform } from "./desktop-platform.ts";

describe("detectDesktopPlatform", () => {
  it("detects macOS from navigator.platform", () => {
    assert.equal(detectDesktopPlatform("", "MacIntel"), "macos");
    assert.equal(detectDesktopPlatform("Mozilla/5.0", "MacARM64"), "macos");
  });

  it("detects macOS from userAgent fallback", () => {
    assert.equal(
      detectDesktopPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", ""),
      "macos",
    );
  });

  it("defaults to windows for Windows, Linux, and undefined inputs", () => {
    assert.equal(detectDesktopPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32"), "windows");
    assert.equal(detectDesktopPlatform("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64"), "windows");
    assert.equal(detectDesktopPlatform(undefined, undefined), "windows");
  });
});
