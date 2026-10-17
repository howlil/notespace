import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const key = process.env.NOTESPACE_UPDATER_PUBLIC_KEY?.trim();
const privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim();
if (!key || !privateKey) {
  throw new Error("Release signing unavailable: provision NOTESPACE_UPDATER_PUBLIC_KEY as a GitHub Actions variable and TAURI_SIGNING_PRIVATE_KEY as a secret. Refusing an unsigned desktop release.");
}
if (!key.startsWith("RWQ") && !key.startsWith("RWT")) {
  // Minisign-encoded Tauri public keys normally start with RW; never accept a
  // placeholder such as an empty string, file path, or generic PEM block.
  if (!/^RW[A-Za-z0-9+/=]+$/.test(key)) {
    throw new Error("Expected inline Tauri minisign public key, not a filename or PEM block");
  }
}
const overlay = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      pubkey: key,
      endpoints: ["https://github.com/howlil/notespace/releases/latest/download/latest.json"],
      windows: { installMode: "passive" },
    },
  },
};
const path = resolve(process.argv[2] || "tauri.updater.release.json");
await writeFile(path, JSON.stringify(overlay, null, 2));
console.log(`Updater release configuration written to ${path} (public key only)`);
