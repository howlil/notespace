import type { Dispatch, SetStateAction } from "react";
import type { NoteSummary } from "../../../platform/api/note-api";
import { Input } from "../../../shared/ui";
import type { NoteBlockSummary } from "../model/note-extract";
import { noteSummaryLabel, type ReferenceState } from "./editor-positioning";

type NoteReferencePickerProps = {
  currentNoteId: string;
  referenceState: ReferenceState;
  setReferenceState: Dispatch<SetStateAction<ReferenceState | null>>;
  referenceResults: NoteSummary[];
  blockResults: NoteBlockSummary[];
  blocksLoading: boolean;
  referenceIndex: number;
  setReferenceIndex: Dispatch<SetStateAction<number>>;
  canCreateAndLink: boolean;
  onApplyReference: (summary: NoteSummary, action?: "link" | "embed" | "block") => void;
  onApplyBlockReference: (block: NoteBlockSummary) => void;
  onCreateAndLinkQuery: (rawQuery: string) => Promise<void>;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onFocusEditor: () => void;
};

export function NoteReferencePicker({
  currentNoteId,
  referenceState,
  setReferenceState,
  referenceResults,
  blockResults,
  blocksLoading,
  referenceIndex,
  setReferenceIndex,
  canCreateAndLink,
  onApplyReference,
  onApplyBlockReference,
  onCreateAndLinkQuery,
  onPlaceLinkedNote,
  onFocusEditor,
}: NoteReferencePickerProps) {
  const totalReferenceItems = referenceResults.length + (canCreateAndLink ? 1 : 0);

  return (
    <div
      className="notespace-note-ui absolute z-[var(--z-popover)] grid min-w-56 max-w-80 gap-1 rounded-lg border border-line bg-surface p-1.5 [box-shadow:var(--shadow-popup)]"
      style={{ left: referenceState.position.left, top: referenceState.position.top }}
      role="listbox"
      aria-label="Canvas Note references"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setReferenceState(null);
          onFocusEditor();
        }
      }}
    >
      {referenceState.step === "pick-note" && (referenceState.mode === "slash-embed" || referenceState.mode === "slash-block-ref") && (
        <Input
          autoFocus
          inputSize="sm"
          className="h-6 rounded bg-canvas px-1.5 text-2xs"
          value={referenceState.query}
          onChange={(event) => {
            setReferenceIndex(0);
            setReferenceState((current) => current?.step === "pick-note" ? { ...current, query: event.target.value } : current);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && totalReferenceItems > 0) {
              event.preventDefault();
              setReferenceIndex((value) => value + 1);
            } else if (event.key === "ArrowUp" && totalReferenceItems > 0) {
              event.preventDefault();
              setReferenceIndex((value) => Math.max(0, value - 1));
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setReferenceState(null);
              onFocusEditor();
            } else if (event.key === "Enter" && referenceResults.length > 0) {
              event.preventDefault();
              const chosen = referenceResults[referenceIndex % referenceResults.length];
              if (chosen) onApplyReference(chosen, referenceState.mode === "slash-embed" ? "embed" : "block");
            }
          }}
          placeholder={referenceState.mode === "slash-embed" ? "Search Note to embed…" : "Search Note for block…"}
          aria-label={referenceState.mode === "slash-embed" ? "Search Note to embed" : "Search Note for block"}
        />
      )}
      {referenceState.step === "pick-note" && (
        <>
          {referenceResults.map((summary, index) => {
            const label = noteSummaryLabel(summary);
            const active = totalReferenceItems > 0 && index === referenceIndex % totalReferenceItems;
            return (
              <div key={summary.id} className={`flex items-center gap-1 rounded px-1 py-0.5 text-2xs ${active ? "bg-tint" : ""}`}>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-1 text-left text-ink hover:text-accent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onApplyReference(
                    summary,
                    referenceState.mode === "slash-embed"
                      ? "embed"
                      : referenceState.mode === "slash-block-ref"
                        ? "block"
                        : "link",
                  )}
                >
                  {label}
                </button>
                {referenceState.mode === "mention" && summary.id !== currentNoteId && (
                  <button
                    type="button"
                    className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onApplyReference(summary, "embed")}
                  >
                    Embed
                  </button>
                )}
                {referenceState.mode === "mention" && (
                  <button
                    type="button"
                    className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onApplyReference(summary, "block")}
                  >
                    Block
                  </button>
                )}
                {referenceState.mode === "mention" && onPlaceLinkedNote && (
                  <button
                    type="button"
                    className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setReferenceState(null);
                      void onPlaceLinkedNote(summary.id);
                    }}
                  >
                    Place
                  </button>
                )}
              </div>
            );
          })}
          {canCreateAndLink && (
            <button
              type="button"
              className={`rounded px-2 py-1 text-left text-2xs font-medium text-accent hover:bg-tint ${
                totalReferenceItems > 0 && referenceIndex % totalReferenceItems === referenceResults.length ? "bg-tint" : ""
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { void onCreateAndLinkQuery(referenceState.query); }}
            >
              {`Create & link "${referenceState.query.trim()}"`}
            </button>
          )}
          {referenceResults.length === 0 && !canCreateAndLink && (
            <span className="px-2 py-1 text-2xs text-muted">
              {referenceState.query.trim() ? "No matching Notes." : "Type a Note title…"}
            </span>
          )}
        </>
      )}
      {referenceState.step === "pick-block" && (
        <>
          <div className="flex items-center justify-between gap-2 border-b border-line px-1 pb-1">
            <button
              type="button"
              className="rounded px-1 py-0.5 text-2xs text-muted hover:bg-tint hover:text-ink"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setReferenceIndex(0);
                setReferenceState((current) => {
                  if (current?.step !== "pick-block") return current;
                  if (current.mode === "mention") {
                    return {
                      mode: "mention",
                      trigger: current.trigger ?? "[[",
                      matchLength: current.matchLength ?? 2,
                      query: current.query,
                      step: "pick-note",
                      position: current.position,
                    };
                  }
                  return {
                    mode: "slash-block-ref",
                    query: current.query,
                    step: "pick-note",
                    position: current.position,
                  };
                });
              }}
            >
              Back
            </button>
            <span className="min-w-0 flex-1 truncate text-right text-2xs font-medium text-muted">
              {referenceState.targetNote.label}
            </span>
          </div>
          {blocksLoading ? (
            <span className="px-2 py-1 text-2xs text-muted">Loading blocks…</span>
          ) : blockResults.length > 0 ? (
            <div className="no-scrollbar grid max-h-48 gap-0.5 overflow-y-auto overscroll-contain">
              {blockResults.map((block, index) => (
                <button
                  key={block.blockId}
                  type="button"
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-2xs text-ink hover:bg-tint ${
                    index === referenceIndex % blockResults.length ? "bg-tint text-accent" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onApplyBlockReference(block)}
                >
                  <span className="min-w-0 flex-1 truncate">{block.preview}</span>
                  <span className="shrink-0 text-2xs text-muted">{block.type}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="px-2 py-1 text-2xs text-muted">No blocks in this Note.</span>
          )}
        </>
      )}
    </div>
  );
}
