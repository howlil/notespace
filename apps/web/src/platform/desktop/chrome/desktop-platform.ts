export type DesktopPlatform = "macos" | "windows";

export function detectDesktopPlatform(userAgent?: string, platform?: string): DesktopPlatform {
  if (/mac/i.test(platform ?? "") || /mac os x|macintosh/i.test(userAgent ?? "")) {
    return "macos";
  }
  return "windows";
}
