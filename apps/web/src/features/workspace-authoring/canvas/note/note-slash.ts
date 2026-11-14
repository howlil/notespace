/**
 * The slash-command query being typed at the caret, or null when no command is open.
 * A "/" starts a command only at the start of text or after whitespace, so paths and URLs stay plain text.
 */
export function noteSlashQuery(textBeforeCaret: string): string | null {
  const match = textBeforeCaret.match(/(?:^|\s)\/([^\s/]*)$/);
  return match ? match[1] ?? "" : null;
}
