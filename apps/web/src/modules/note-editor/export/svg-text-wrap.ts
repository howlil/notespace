export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

export function estimateCharWidth(character: string, fontSize: number, monospace: boolean): number {
  if (monospace) return character === "\t" ? fontSize * 1.2 : fontSize * 0.6;
  const code = character.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return fontSize * 0.96;
  if ("iIl1.,;:'!|()[] ".includes(character)) return fontSize * 0.34;
  if ("mwMW@%".includes(character)) return fontSize * 0.78;
  return fontSize * 0.56;
}

export function estimateTextWidth(text: string, fontSize: number, monospace: boolean): number {
  let width = 0;
  for (const character of Array.from(text)) {
    width += estimateCharWidth(character, fontSize, monospace);
  }
  return width;
}

function breakLongWord(word: string, maxWidthPx: number, fontSize: number, monospace: boolean): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const character of Array.from(word)) {
    const charWidth = estimateCharWidth(character, fontSize, monospace);
    if (current && currentWidth + charWidth > maxWidthPx) {
      chunks.push(current);
      current = character;
      currentWidth = charWidth;
    } else {
      current += character;
      currentWidth += charWidth;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

export function wrapText(text: string, maxWidthPx: number, fontSize: number, monospace = false): string[] {
  const safeMaxWidth = Math.max(fontSize, maxWidthPx);
  const rawLines = text.split(/\r?\n/);
  const result: string[] = [];

  for (const rawLine of rawLines) {
    if (!rawLine) {
      result.push("");
      continue;
    }
    if (monospace) {
      result.push(...breakLongWord(rawLine, safeMaxWidth, fontSize, true));
      continue;
    }
    const normalized = rawLine.replace(/\s+/g, " ").trim();
    if (!normalized) {
      result.push("");
      continue;
    }
    const words = normalized.split(" ");
    let current = "";
    let currentWidth = 0;
    const spaceWidth = estimateCharWidth(" ", fontSize, false);
    for (const word of words) {
      const wordWidth = estimateTextWidth(word, fontSize, false);
      if (!current) {
        if (wordWidth <= safeMaxWidth) {
          current = word;
          currentWidth = wordWidth;
        } else {
          const chunks = breakLongWord(word, safeMaxWidth, fontSize, false);
          result.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] ?? "";
          currentWidth = estimateTextWidth(current, fontSize, false);
        }
        continue;
      }
      if (currentWidth + spaceWidth + wordWidth <= safeMaxWidth) {
        current = `${current} ${word}`;
        currentWidth += spaceWidth + wordWidth;
      } else {
        result.push(current);
        if (wordWidth <= safeMaxWidth) {
          current = word;
          currentWidth = wordWidth;
        } else {
          const chunks = breakLongWord(word, safeMaxWidth, fontSize, false);
          result.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] ?? "";
          currentWidth = estimateTextWidth(current, fontSize, false);
        }
      }
    }
    if (current) result.push(current);
  }

  return result;
}

export function truncateLine(text: string, maxWidthPx: number, fontSize: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (estimateTextWidth(normalized, fontSize, false) <= maxWidthPx) return normalized;
  const ellipsisWidth = fontSize * 0.72;
  const budget = Math.max(fontSize, maxWidthPx - ellipsisWidth);
  let output = "";
  let width = 0;
  for (const character of Array.from(normalized)) {
    const charWidth = estimateCharWidth(character, fontSize, false);
    if (output && width + charWidth > budget) break;
    output += character;
    width += charWidth;
  }
  return `${output.trimEnd()}…`;
}
