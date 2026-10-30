# HTML code preview (Note + Canvas)

## Behavior
- Use the existing Code Block in Note (Tiptap) or Canvas (Excalidraw).
- Select **HTML / XML** in the language menu. Write a self-contained HTML snippet or full document with inline CSS and JavaScript.
- Choose **Preview HTML** to create an interactive rendered iframe; **Hide HTML preview** stops the preview and returns to the source-only view. The preview refreshes after 450 ms of source inactivity.
- In Note, preview is below editable code. On Canvas, it is an anchored panel attached to the selected code block (rather than changing the Excalidraw element bounds).
- Source continues to save through existing Note and Canvas transactions. Preview visibility and JavaScript state are ephemeral and never stored or imported.

## Execution boundary
Arbitrary HTML is executable, not safe application markup. `HtmlPreviewFrame` renders user content only inside an iframe with `sandbox="allow-scripts"`; **never add `allow-same-origin`**, access to Tauri, or parent-window messaging. The child document starts with a restrictive CSP before source markup. Only inline CSS, inline JavaScript, and embedded data resources are intended. External scripts, fetch/XHR, workers, nested frames, forms, and popups are blocked. No referrer is provided.

Preview execution is explicitly initiated; merely opening an imported/untrusted Note must not execute its HTML. Closing preview unmounts its iframe. Previewed JavaScript is not supported as a general-purpose trusted browser runtime and must not receive privileged capabilities.

Known limitation: iframe/CSP isolation cannot guarantee CPU/memory limits for adversarial JavaScript and navigation restrictions vary by browser engine. Before claiming a public security guarantee, validate the trust boundary on the actual Tauri WebView2 build. A full remote-network sandbox or package manager is not part of this feature.

## Implementation
- `features/workspace-authoring/code/HtmlPreviewFrame.tsx` owns shared iframe and CSP.
- `document/NoteCodeBlockNode.tsx` owns Note opt-in toggle.
- `canvas/CanvasCodeBlockLayer.tsx`, `canvas/CanvasCodeBlockActions.tsx`, `canvas/CanvasEditor.tsx` own Canvas selection, preview panel, and toggle.
- No schema changes, worker runner replacement, API, database, migration, new runtime dependency, or public release workflow.

See [Issue #188](https://github.com/howlil/notespace/issues/188).
