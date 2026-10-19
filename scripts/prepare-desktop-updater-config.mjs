import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const key = process.env.NOTESPACE_UPDATER_PUBLIC_KEY?.trim();
const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim();
if (!key || !privateKey) {
  throw new Error("Release signing unavailable: provision NOTESPACE_UPDATER_PUBLIC_KEY as a GitHub Actions variable and TAURI_SIGNING_PRIVATE_KEY as a secret. Refusing an unsigned desktop release.");
}
// Tauri's signer emits base64 of the full minisign public-key box, usually
// starting with "dW50..." ("untrusted comment:") rather than raw "RW...".
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
  throw new Error("Updater public key must be base64 of the Tauri minisign public-key box");
}
const decoded = Buffer.from(key, "base64").toString("utf8");
if (!decoded.startsWith("untrusted comment:") || !/^RW[A-Za-z0-9+/=]+$/m.test(decoded)) {
  throw new Error("Updater public key is not a valid-looking Tauri minisign public-key box");
}
const channel = process.env.NOTESPACE_UPDATER_CHANNEL?.trim() || "stable";
if (!["stable", "beta"].includes(channel)) {
  throw new Error("Unknown Notespace updater channel");
}
const betaWixVersion = process.env.NOTESPACE_BETA_WIX_VERSION?.trim();
if (channel === "beta" && !/^0\.1\.[1-9][0-9]*$/.test(betaWixVersion || "")) {
  throw new Error("Signed beta requires an increasing numeric WiX installer version");
}
if (channel !== "beta" && betaWixVersion) {
  throw new Error("WiX beta version may only be set for signed beta releases");
}
const endpoint = channel === "beta"
  ? "https://raw.githubusercontent.com/howlil/notespace/desktop-beta-feed/latest.json"
  : "https://github.com/howlil/notespace/releases/latest/download/latest.json";

const overlay = {
  bundle: { createUpdaterArtifacts: true, ...(betaWixVersion ? { windows: { wix: { version: betaWixVersion } } } : {}) },
  plugins: {
    updater: {
      pubkey: key,
      endpoints: [endpoint],
      windows: { installMode: "passive" },
    },
  },
};
const path = resolve(process.argv[2] || "tauri.updater.release.json");
await writeFile(path, JSON.stringify(overlay, null, 2));
console.log(`Updater release configuration written to ${path} (public key only)`);
