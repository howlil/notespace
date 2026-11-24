import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";

const webRoot = fileURLToPath(new URL("./apps/web/src/", import.meta.url));
const layerDependencies = {
  routes: ["routes", "pages", "features", "adapters", "domain", "shared"],
  pages: ["pages", "features", "adapters", "domain", "shared"],
  features: ["features", "adapters", "domain", "shared"],
  adapters: ["adapters", "domain", "shared"],
  domain: ["domain"],
  shared: ["shared"],
};

const webBoundaries = {
  meta: { schema: [], messages: { boundary: "{{reason}}" } },
  create(context) {
    const from = relative(webRoot, context.filename).replaceAll("\\", "/");
    const [layer, feature] = from === "router.tsx" ? ["routes"] : from.split("/");
    const report = (node, reason) => context.report({ node, messageId: "boundary", data: { reason } });

    if (!Object.hasOwn(layerDependencies, layer)) {
      return { Program: (node) => report(node, "Place web modules in one of the six owning layers.") };
    }

    function checkSpecifier(node) {
      if (!node) return;
      const specifier = node.type === "TemplateLiteral" && node.expressions.length === 0
        ? node.quasis[0].value.cooked : node.value;
      if (typeof specifier !== "string") {
        report(node, "Use a literal module specifier so the dependency can be checked.");
        return;
      }

      if (!specifier.startsWith(".")) {
        if (/^(?:[@~#]?\/|src\/)/.test(specifier) || Object.hasOwn(layerDependencies, specifier.split("/")[0])) {
          report(node, "Use a relative import for a local web module.");
        } else if (specifier.startsWith("@excalidraw/") && !from.startsWith("features/workspace-authoring/canvas/")) {
          report(node, "Keep the Excalidraw SDK inside the Canvas editor.");
        } else if (layer === "domain" && /^(?:react(?:-dom)?(?:\/|$)|motion(?:\/|$)|@(?:tanstack|tiptap|tauri-apps|radix-ui)\/)/.test(specifier)) {
          report(node, "Web domain modules cannot depend on UI, editor, or desktop packages.");
        } else if (layer === "features" && feature !== "desktop" && specifier.startsWith("@tauri-apps/")) {
          report(node, "Use the desktop adapter for native IPC.");
        }
        return;
      }

      const target = relative(webRoot, resolve(dirname(context.filename), specifier)).replaceAll("\\", "/");
      if (from === "router.tsx" && /^routeTree\.gen(?:\.ts)?$/.test(target)) return;
      const [targetLayer, targetOwner, ...entry] = target.split("/");
      if (!layerDependencies[layer].includes(targetLayer)) {
        report(node, `${layer} cannot depend on ${target}.`);
      } else if (layer === "pages" && targetLayer === "adapters" && targetOwner === "http") {
        report(node, "Compose a feature or use route-owned loading for HTTP access.");
      } else if (/^features\/workspace-authoring\/canvas\/CanvasEditor(?:\.tsx)?$/.test(target) && node.parent.type !== "ImportExpression") {
        report(node, "Load CanvasEditor through a dynamic import.");
      } else if (targetLayer === "features") {
        const isEntry = entry.length === 0 || /^index(?:\.ts)?$/.test(entry.join("/"));
        const ownsTarget = layer === "features" && feature === targetOwner;
        const isRootStyle = from === "routes/__root.tsx" && /\.css\?inline$/.test(target);
        if (layer === "features" && !ownsTarget) {
          report(node, "Compose sibling features at a page or route boundary.");
        } else if (ownsTarget && isEntry) {
          report(node, "Import directly within the owning feature.");
        } else if (!ownsTarget && !isEntry && !isRootStyle) {
          report(node, "Use the feature's public entry.");
        }
      }
    }

    const checkSource = (node) => checkSpecifier(node.source);
    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ImportExpression: checkSource,
      TSImportType: checkSource,
      TSExternalModuleReference: (node) => checkSpecifier(node.expression),
    };
  },
};

export default tseslint.config(
  { ignores: ["**/routeTree.gen.ts", "**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": hooks },
    rules: hooks.configs.recommended.rules,
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    plugins: { notespace: { rules: { "web-boundaries": webBoundaries } } },
    rules: { "notespace/web-boundaries": "error" },
  },
  {
    files: ["apps/web/src/domain/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", {
        globals: ["window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "WebSocket"],
        checkGlobalObject: true,
      }],
    },
  },
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Browser journeys evaluate closures inside the page, so these files
    // legitimately use both Node and DOM globals.
    files: ["tests/e2e/**/*.mjs", "scripts/verify/browser-e2e.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
