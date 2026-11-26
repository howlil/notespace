export type MentionTriggerKind = "wikilink" | "at";

export type MentionTrigger = {
  kind: MentionTriggerKind;
  query: string;
  from: number;
  to: number;
};

function isInsideFencedCode(docText: string, offset: number): boolean {
  const prefix = docText.slice(0, offset);
  const lines = prefix.split(/\r?\n/);
  let fenceChar: "`" | "~" | null = null;
  let fenceLength = 0;

  for (let i = 0; i < lines.length - 1; i += 1) {
    const trimmed = lines[i].trimStart();
    const match = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
    if (!match) continue;
    const marker = match[1];
    const char = marker[0] as "`" | "~";
    const len = marker.length;
    if (fenceChar === null) {
      fenceChar = char;
      fenceLength = len;
    } else if (char === fenceChar && len >= fenceLength && match[2].trim() === "") {
      fenceChar = null;
      fenceLength = 0;
    }
  }

  return fenceChar !== null;
}

function isInsideInlineCode(lineBeforeCursor: string): boolean {
  let activeFenceLen = 0;
  let i = 0;
  while (i < lineBeforeCursor.length) {
    if (lineBeforeCursor[i] !== "`") {
      i += 1;
      continue;
    }
    let run = 0;
    while (i + run < lineBeforeCursor.length && lineBeforeCursor[i + run] === "`") {
      run += 1;
    }
    if (activeFenceLen === 0) {
      activeFenceLen = run;
    } else if (run === activeFenceLen) {
      activeFenceLen = 0;
    }
    i += run;
  }
  return activeFenceLen > 0;
}

/**
 * Detects an active `[[query` or whitespace-preceded `@query` mention trigger
 * immediately preceding `cursorOffset`, ignoring code blocks, inline code, and emails.
 */
export function detectMentionTrigger(docText: string, cursorOffset: number): MentionTrigger | null {
  if (cursorOffset < 0 || cursorOffset > docText.length) return null;
  if (isInsideFencedCode(docText, cursorOffset)) return null;

  const lineStart = docText.lastIndexOf("\n", cursorOffset - 1) + 1;
  const beforeCursor = docText.slice(lineStart, cursorOffset);
  if (isInsideInlineCode(beforeCursor)) return null;

  let wikilinkCandidate: MentionTrigger | null = null;
  const bracketIdx = beforeCursor.lastIndexOf("[[");
  if (bracketIdx !== -1) {
    const query = beforeCursor.slice(bracketIdx + 2);
    if (!query.includes("]]") && !query.includes("[") && !query.includes("\n")) {
      wikilinkCandidate = {
        kind: "wikilink",
        query,
        from: lineStart + bracketIdx,
        to: cursorOffset,
      };
    }
  }

  let atCandidate: MentionTrigger | null = null;
  const atIdx = beforeCursor.lastIndexOf("@");
  if (atIdx !== -1) {
    const validBoundary = atIdx === 0 || /\s/.test(beforeCursor[atIdx - 1]);
    if (validBoundary) {
      const query = beforeCursor.slice(atIdx + 1);
      if (!query.includes("[") && !query.includes("]") && !query.includes("\n")) {
        atCandidate = {
          kind: "at",
          query,
          from: lineStart + atIdx,
          to: cursorOffset,
        };
      }
    }
  }

  if (wikilinkCandidate && atCandidate) {
    return wikilinkCandidate.from >= atCandidate.from ? wikilinkCandidate : atCandidate;
  }
  return wikilinkCandidate ?? atCandidate;
}

/**
 * Formats an internal Note Markdown link for insertion at a mention trigger range.
 */
export function formatNoteMentionLink(label: string, noteId: string): string {
  const cleanLabel = label
    .replace(/[\r\n]+/g, " ")
    .replace(/[[\]]/g, "")
    .trim() || "Untitled Note";
  return `[${cleanLabel}](/workspaces/_?noteId=${encodeURIComponent(noteId)})`;
}
