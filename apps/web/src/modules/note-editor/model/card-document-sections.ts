export type CardDocumentSections = {
  headline: string;
  body: string;
  prefix: "# " | "";
  editableHeadline: boolean;
};

const H1_LINE_RE = /^#[ \t]+(.*)$/;
const NON_TITLE_LINE_RE = /^(?:#{2,6}(?:\s|$)|```|~~~|>|\|(?:\s*:?-{3,}:?\s*\|)?|[-+*]\s|\d{1,9}[.)]\s|\$\$$|(?:[-*_]\s*){3,}$)/;

/**
 * Splits a Markdown Note into a leading headline line and body text so full-page
 * Card views can present an editable Heptabase-style title without introducing
 * a separate stored title field.
 */
export function splitCardDocument(rawText: string): CardDocumentSections {
  if (rawText.trim() === "") {
    return { headline: "", body: "", prefix: "# ", editableHeadline: true };
  }

  const normalized = rawText.replace(/\r\n/g, "\n");
  const breakIndex = normalized.indexOf("\n");
  const firstLine = breakIndex === -1 ? normalized : normalized.slice(0, breakIndex);
  const trimmedFirst = firstLine.trim();
  const h1Match = H1_LINE_RE.exec(trimmedFirst);

  if (h1Match) {
    const rest = breakIndex === -1 ? "" : normalized.slice(breakIndex + 1).replace(/^\n/, "");
    return {
      headline: h1Match[1].trim(),
      body: rest,
      prefix: "# ",
      editableHeadline: true,
    };
  }

  if (trimmedFirst !== "" && !NON_TITLE_LINE_RE.test(trimmedFirst)) {
    const rest = breakIndex === -1 ? "" : normalized.slice(breakIndex + 1).replace(/^\n/, "");
    return {
      headline: trimmedFirst,
      body: rest,
      prefix: "",
      editableHeadline: true,
    };
  }

  return {
    headline: "",
    body: normalized,
    prefix: "# ",
    editableHeadline: false,
  };
}

/**
 * Reconstructs canonical Markdown source from an optional editable headline and
 * body text, avoiding synthetic placeholder headings when the title is cleared.
 */
export function joinCardDocument(
  headline: string,
  body: string,
  prefix: "# " | "",
): string {
  const cleanHeadline = headline.replace(/\r?\n/g, " ").trim();
  const cleanBody = body.replace(/\r\n/g, "\n");
  if (!cleanHeadline) {
    return cleanBody.trim() === "" ? "" : cleanBody;
  }
  const head = `${prefix}${cleanHeadline}`;
  if (cleanBody === "") return head;
  return `${head}\n\n${cleanBody.replace(/^\n+/, "")}`;
}
