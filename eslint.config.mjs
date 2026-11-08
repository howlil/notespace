import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";

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
