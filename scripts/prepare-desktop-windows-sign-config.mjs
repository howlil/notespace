import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function signingConfig(env) {
  const endpoint = env.NOTESPACE_AZURE_SIGNING_ENDPOINT?.trim();
  const account = env.NOTESPACE_AZURE_SIGNING_ACCOUNT?.trim();
  const profile = env.NOTESPACE_AZURE_SIGNING_PROFILE?.trim();
  for (const [label, value] of Object.entries({
    NOTESPACE_AZURE_SIGNING_ENDPOINT: endpoint,
    NOTESPACE_AZURE_SIGNING_ACCOUNT: account,
    NOTESPACE_AZURE_SIGNING_PROFILE: profile,
    AZURE_CLIENT_ID: env.AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET: env.AZURE_CLIENT_SECRET,
    AZURE_TENANT_ID: env.AZURE_TENANT_ID,
  })) {
    if (!value) throw new Error(`Production Authenticode signing requires ${label}`);
  }
  let url;
  try { url = new URL(endpoint); }
  catch { throw new Error("Invalid Azure Artifact Signing endpoint"); }
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.codesigning\.azure\.net$/.test(url.hostname)
      || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Signing endpoint must be a trusted Azure Artifact Signing HTTPS host");
  }
  if (![account, profile].every(value => /^[A-Za-z0-9_-]{1,128}$/.test(value))) {
    throw new Error("Azure signing account/profile contain unsupported shell characters");
  }
  return {
    bundle: {
      windows: {
        signCommand: `artifact-signing-cli -e ${url.origin} -a ${account} -c ${profile} -d Notespace %1`,
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2];
  if (!path) throw new Error("Supply existing Tauri release overlay path");
  const overlay = JSON.parse(await readFile(path, "utf8"));
  const sign = signingConfig(process.env);
  overlay.bundle = { ...overlay.bundle, ...sign.bundle, windows: sign.bundle.windows };
  await writeFile(path, JSON.stringify(overlay, null, 2));
  console.log("Production Windows Authenticode signing configured (no Azure credentials persisted)");
}
