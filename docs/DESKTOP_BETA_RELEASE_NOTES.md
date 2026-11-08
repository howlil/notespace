# Notespace Desktop beta release candidate

This candidate covers the current `master` build and remains unpublished until
the exact commit passes both `Verify` and `Verify Desktop`.

## Highlights

- Redesigned embedded Canvas code blocks with focused language, run, stop and
  copy controls plus a compact settings toolbar.
- Added foldable code output and export-safe code block rendering.
- Hardened the browser code-runner worker and desktop data/runtime safeguards.
- Declared the runtime color dependency required by the bundled Excalidraw
  distribution so clean release builds resolve it deterministically.

The beta publisher selects the next immutable version and publishes only after
its signed native acceptance checks complete.
