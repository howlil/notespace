import katex from "katex";

export type NoteLatexValidation =
  | { ok: true; html: string }
  | { ok: false; error: string };

const UNTRUSTED_LATEX_COMMAND = /\\(?:href|url|includegraphics|htmlClass|htmlId|htmlStyle|htmlData)\b/i;

/**
 * Validates and renders a LaTeX formula with KaTeX (`trust: false` blocks unsafe commands).
 * On invalid syntax, returns a recoverable error without inventing a result (B14).
 */
export function renderNoteLatex(latex: string, displayMode: boolean): NoteLatexValidation {
  const source = latex.trim();
  if (!source) {
    return { ok: false, error: "Enter a LaTeX formula." };
  }
  if (UNTRUSTED_LATEX_COMMAND.test(source)) {
    return { ok: false, error: "Links and HTML commands are not allowed in Math formulas." };
  }
  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      strict: false,
      trust: false,
      displayMode,
    });
    if (html.includes("katex-error")) {
      return { ok: false, error: "Invalid LaTeX formula." };
    }
    return { ok: true, html };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Invalid LaTeX formula.";
    return { ok: false, error: raw.replace(/^KaTeX parse error:\s*/i, "") };
  }
}
