/**
 * The slash-command query being typed at the caret, or null when no command is open.
 * A "/" starts a command only at the start of text or after whitespace, so paths and URLs stay plain text.
 */
export function noteSlashQuery(textBeforeCaret: string): string | null {
  const match = textBeforeCaret.match(/(?:^|\s)\/([^\s/]*)$/);
  return match ? match[1] ?? "" : null;
}

export type NoteMentionTrigger = "[[" | "@";

export type NoteMentionQuery = {
  trigger: NoteMentionTrigger;
  query: string;
  /** Character count from the trigger start to the caret, ready for range replacement. */
  matchLength: number;
};

/**
 * Detects an active `[[...` or `@...` Note mention query at the caret.
 * `@` triggers only at the start of text or after whitespace so emails like `foo@bar` stay plain text.
 */
export function noteMentionQuery(textBeforeCaret: string): NoteMentionQuery | null {
  const bracket = textBeforeCaret.match(/\[\[([^[\]\n]*)$/);
  if (bracket) {
    const query = bracket[1] ?? "";
    return { trigger: "[[", query, matchLength: 2 + query.length };
  }
  const at = textBeforeCaret.match(/(?:^|\s)@([^\s@\n]*)$/);
  if (at) {
    const query = at[1] ?? "";
    return { trigger: "@", query, matchLength: 1 + query.length };
  }
  return null;
}

export type NoteSlashCommandId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "toggle"
  | "codeBlock"
  | "blockquote"
  | "callout"
  | "divider"
  | "table"
  | "image"
  | "math"
  | "embedNote"
  | "blockReference"
  | "extractToNote";

export type NoteSlashCommandGroup = "blocks" | "media" | "notes";

export type NoteSlashCommand = {
  id: NoteSlashCommandId;
  label: string;
  description: string;
  group: NoteSlashCommandGroup;
  keywords: readonly string[];
};

export const NOTE_SLASH_COMMANDS: readonly NoteSlashCommand[] = [
  {
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
    group: "blocks",
    keywords: ["h1", "heading", "title", "header"],
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
    group: "blocks",
    keywords: ["h2", "heading", "subtitle", "header"],
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
    group: "blocks",
    keywords: ["h3", "heading", "subheading", "header"],
  },
  {
    id: "bulletList",
    label: "Bullet list",
    description: "Bulleted list",
    group: "blocks",
    keywords: ["ul", "list", "bullets", "unordered"],
  },
  {
    id: "orderedList",
    label: "Numbered list",
    description: "Numbered list",
    group: "blocks",
    keywords: ["ol", "list", "ordered", "numbers", "1."],
  },
  {
    id: "taskList",
    label: "Checklist",
    description: "Interactive task list",
    group: "blocks",
    keywords: ["todo", "task", "tasks", "checkbox", "check"],
  },
  {
    id: "toggle",
    label: "Toggle",
    description: "Collapsible section",
    group: "blocks",
    keywords: ["collapse", "collapsible", "disclosure", "details", "accordion"],
  },
  {
    id: "codeBlock",
    label: "Code block",
    description: "Monospace code snippet",
    group: "blocks",
    keywords: ["code", "pre", "snippet", "fence"],
  },
  {
    id: "blockquote",
    label: "Quote",
    description: "Quoted text",
    group: "blocks",
    keywords: ["blockquote", "citation", "pullquote"],
  },
  {
    id: "callout",
    label: "Callout",
    description: "Highlighted callout box",
    group: "blocks",
    keywords: ["note", "info", "tip", "warning", "danger", "admonition"],
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal divider",
    group: "blocks",
    keywords: ["hr", "rule", "line", "separator", "horizontal"],
  },
  {
    id: "table",
    label: "Table",
    description: "2x2 table with header",
    group: "media",
    keywords: ["grid", "columns", "rows", "spreadsheet"],
  },
  {
    id: "image",
    label: "Image",
    description: "Insert image from device",
    group: "media",
    keywords: ["img", "photo", "picture", "upload", "media"],
  },
  {
    id: "math",
    label: "Math",
    description: "LaTeX math formula",
    group: "media",
    keywords: ["latex", "katex", "formula", "equation", "tex"],
  },
  {
    id: "embedNote",
    label: "Embed note",
    description: "Embed a read-only Note preview",
    group: "notes",
    keywords: ["embed", "transclude", "card", "note", "reference"],
  },
  {
    id: "blockReference",
    label: "Block reference",
    description: "Reference a specific block",
    group: "notes",
    keywords: ["block", "ref", "reference", "cite", "link"],
  },
  {
    id: "extractToNote",
    label: "Extract to Note",
    description: "Move block to a connected Note",
    group: "notes",
    keywords: ["extract", "split", "branch", "new note"],
  },
] as const;

function slashMatchScore(command: NoteSlashCommand, query: string): number | null {
  const label = command.label.toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (command.keywords.some((keyword) => keyword.toLowerCase() === query)) return 2;
  if (command.keywords.some((keyword) => keyword.toLowerCase().startsWith(query))) return 3;
  if (label.includes(query)) return 4;
  if (
    command.id.toLowerCase().includes(query)
    || command.keywords.some((keyword) => keyword.toLowerCase().includes(query))
  ) {
    return 5;
  }
  return null;
}

/** Filters and ranks slash commands by label, id, and keyword aliases. */
export function filterNoteSlashCommands(query: string): NoteSlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...NOTE_SLASH_COMMANDS];
  return NOTE_SLASH_COMMANDS
    .map((command, index) => ({ command, index, score: slashMatchScore(command, normalized) }))
    .filter((entry): entry is { command: NoteSlashCommand; index: number; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.command);
}
