import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
await mkdir(new URL("public/excalidraw-assets/", root), { recursive: true });
await cp(
  fileURLToPath(
    new URL("node_modules/@excalidraw/excalidraw/dist/prod/fonts", root),
  ),
  fileURLToPath(new URL("public/excalidraw-assets/fonts", root)),
  { recursive: true },
);
