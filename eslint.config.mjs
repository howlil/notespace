import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";

const webRoot = fileURLToPath(new URL("./apps/web/src/", import.meta.url));
const layerDependencies = {
  routes: ["routes", "app", "platform", "entities", "shared"],
  app: ["app", "modules", "platform", "entities", "shared"],
  modules: ["modules", "platform", "entities", "shared"],
  platform: ["platform", "entities", "shared"],
  entities: ["entities"],
  shared: ["shared"],
};
const allowedModuleDependencies = {
  workspace: ["canvas", "note-editor"],
  canvas: ["note-editor"],
  library: [],
  "note-editor": [],
};

const webBoundaries = {
  meta: { schema: [], messages: { boundary: "{{reason}}" } },
  create(context) {
    const from = relative(webRoot, context.filename).replaceAll("\\", "/");
    const [layer, owner] = from === "router.tsx" ? ["routes"] : from.split("/");
    const isModelFile = layer === "entities" || from.includes("/model/");
    const report = (node, reason) => context.report({ node, messageId: "boundary", data: { reason } });

    if (!Object.hasOwn(layerDependencies, layer)) {
      return { Program: (node) => report(node, "Place web modules in one of the six owning layers: routes, app, modules, platform, entities, shared.") };
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
        } else if (specifier.startsWith("@excalidraw/") && !from.startsWith("modules/canvas/")) {
          report(node, "Keep the Excalidraw SDK inside modules/canvas/.");
        } else if (specifier.startsWith("@tiptap/") && !from.startsWith("modules/note-editor/")) {
          report(node, "Keep the TipTap SDK inside modules/note-editor/.");
        } else if (isModelFile && /^(?:react(?:-dom)?(?:\/|$)|motion(?:\/|$)|@(?:tanstack|tiptap|excalidraw|tauri-apps|radix-ui)\/)/.test(specifier)) {
          report(node, "Entities and model modules cannot depend on UI, editor, or desktop packages.");
        } else if (specifier.startsWith("@tauri-apps/") && !(layer === "platform" && (owner === "desktop" || owner === "runtime"))) {
          report(node, "Keep native Tauri IPC inside platform/desktop or platform/runtime.");
        }
        return;
      }

      const target = relative(webRoot, resolve(dirname(context.filename), specifier)).replaceAll("\\", "/");
      if (from === "router.tsx" && /^routeTree\.gen(?:\.ts)?$/.test(target)) return;
      const [targetLayer, targetOwner, ...entry] = target.split("/");
      if (!layerDependencies[layer].includes(targetLayer)) {
        report(node, `${layer} cannot depend on ${target}.`);
      } else if (layer === "app" && owner === "pages" && targetLayer === "platform" && targetOwner === "api") {
        report(node, "Compose a module or use route-owned loading for HTTP access.");
      } else if (layer === "app" && owner === "pages" && /^app\/shell\/LibraryPageShell(?:\.tsx)?$/.test(target)) {
        report(node, "Mount LibraryPageShell only in app/shell/PersistentAppShell.tsx; pages render content only.");
      } else if (/^modules\/canvas\/core\/CanvasEditor(?:\.tsx)?$/.test(target) && node.parent.type !== "ImportExpression") {
        report(node, "Load CanvasEditor through a dynamic import.");
      } else if (targetLayer === "modules") {
        const isEntry = entry.length === 0 || /^(?:index|export)(?:\.ts)?$/.test(entry.join("/"));
        const ownsTarget = layer === "modules" && owner === targetOwner;
        const isRootStyle = (from === "routes/__root.tsx" || from === "app/styles.ts") && /\.css\?inline$/.test(target);
        const isLazyCanvas = layer === "modules" && owner === "workspace" && /^modules\/canvas\/core\/CanvasEditor(?:\.tsx)?$/.test(target);
        if (layer === "modules" && !ownsTarget) {
          const allowed = allowedModuleDependencies[owner] ?? [];
          if (!allowed.includes(targetOwner)) {
            report(node, `Module ${owner} cannot depend on sibling module ${targetOwner}; compose at app/.`);
          } else if (!isEntry && !isLazyCanvas) {
            report(node, `Import ${targetOwner} through its public entry.`);
          }
        } else if (ownsTarget && isEntry) {
          report(node, "Import directly within the owning module.");
        } else if (!ownsTarget && !isEntry && !isRootStyle && !isLazyCanvas) {
          report(node, "Use the module's public entry.");
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

const uiTokens = {
  meta: { schema: [], messages: { token: "{{reason}}" } },
  create(context) {
    const checkText = (node, value) => {
      if (typeof value !== "string" || !value) return;
      if (/(?:bg|text|border|outline|ring)-\[var\(--[a-z-]+\)\]/.test(value)) {
        context.report({
          node,
          messageId: "token",
          data: { reason: "Use semantic Tailwind token utilities (e.g. bg-surface, text-ink, border-line) instead of arbitrary var() classes." },
        });
      }
      if (/\[scrollbar-width:none\]/.test(value)) {
        context.report({
          node,
          messageId: "token",
          data: { reason: "Use the shared `no-scrollbar` utility from globals.css instead of raw scrollbar-width classes." },
        });
      }
      if (/\bz-\[(?:[2-9]\d|\d{3,})\]/.test(value)) {
        context.report({
          node,
          messageId: "token",
          data: { reason: "Use a semantic z-index token (z-[var(--z-*)]) from globals.css instead of arbitrary numeric z-index values." },
        });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") checkText(node, node.value);
      },
      TemplateElement(node) {
        checkText(node, node.value.raw);
      },
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
    plugins: { notespace: { rules: { "web-boundaries": webBoundaries, "ui-tokens": uiTokens } } },
    rules: {
      "notespace/web-boundaries": "error",
      "notespace/ui-tokens": "error",
    },
  },
  {
    files: ["apps/web/src/entities/**/*.{ts,tsx}", "apps/web/src/modules/**/model/**/*.{ts,tsx}"],
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
