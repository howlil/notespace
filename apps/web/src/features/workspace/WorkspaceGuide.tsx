import { motion } from "motion/react";
import { BookOpen, CircleHelp, FileText, Layers, Network, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { IconButton } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";

const nodeClass = "rounded-md border border-line bg-background px-2 py-1.5 text-center text-[10px] font-medium text-ink";

export function WorkspaceGuide() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissablePopup(rootRef, open, dismiss);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        aria-label="Workspace guide"
        title="Workspace guide"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp size={17} />
      </IconButton>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="absolute top-[calc(100%+8px)] right-0 z-40 w-[min(410px,calc(100vw_-_24px))] max-h-[calc(100dvh_-_86px)] overflow-y-auto rounded-xl border border-line bg-surface p-4 text-ink shadow-[0_18px_48px_#0003] max-[560px]:fixed max-[560px]:top-[52px] max-[560px]:right-3 max-[560px]:left-3 max-[560px]:w-auto max-[560px]:max-h-[calc(100dvh_-_64px)]"
          role="dialog"
          aria-label="How to use a workspace"
        >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-semibold"><BookOpen size={16} className="text-accent" /> Workspace guide</div>
              <p className="mt-1 text-[11px] leading-5 text-muted">Keep one workspace focused on one coherent topic or mental model.</p>
            </div>
            <IconButton className="-mt-1 -mr-1 size-7" aria-label="Close workspace guide" onClick={dismiss}><X size={14} /></IconButton>
          </header>

          <section className="mt-4 rounded-lg border border-line bg-background p-3" aria-label="Workspace visual example">
            <div className="mb-2.5 flex items-center gap-2 text-[10px] font-medium text-muted"><Network size={13} /> Example structure</div>
            <div className="mx-auto grid max-w-[315px] grid-cols-[1fr_24px_1fr] items-center gap-y-2">
              <div className={`${nodeClass} col-span-3 mx-auto min-w-[150px]`}>Operating Systems</div>
              <div className="col-span-3 text-center text-[11px] text-muted">↓</div>
              <div className={`${nodeClass} col-span-3 mx-auto min-w-[150px] border-accent/50 bg-tint`}>Virtual Memory</div>
              <div className="col-span-3 grid grid-cols-[1fr_24px_1fr] items-start pt-1">
                <div className="grid gap-1 text-center">
                  <span className="text-[10px] text-muted">↙</span>
                  <div className={nodeClass}><span className="flex items-center justify-center gap-1.5"><FileText size={12} /> Notes</span><span className="mt-1 block font-normal text-muted">details & examples</span></div>
                </div>
                <div />
                <div className="grid gap-1 text-center">
                  <span className="text-[10px] text-muted">↘</span>
                  <div className={nodeClass}><span className="flex items-center justify-center gap-1.5"><Layers size={12} /> Canvas</span><span className="mt-1 block font-normal text-muted">relationships</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-3 text-[11px] leading-5">
            <GuideRule number="01" title="One workspace = one topic">
              Keep several notes and one canvas together when they explain the same central question.
            </GuideRule>
            <GuideRule number="02" title="Notes hold the details">
              Use notes for definitions, explanations, examples, steps, and references.
            </GuideRule>
            <GuideRule number="03" title="Canvas holds the mental model">
              Use the canvas to see how the concepts relate instead of duplicating every detail.
            </GuideRule>
          </section>

          <section className="mt-4 border-t border-line pt-3">
            <div className="text-[11px] font-semibold">Create another workspace when</div>
            <ul className="mt-1.5 grid gap-1 pl-4 text-[10px] leading-5 text-muted">
              <li className="list-disc">the central question changes;</li>
              <li className="list-disc">the canvas starts describing several independent models;</li>
              <li className="list-disc">you cannot explain the workspace as one main idea.</li>
            </ul>
          </section>
        </motion.div>
      )}
    </div>
  );
}

function GuideRule({ number, title, children }: { number: string; title: string; children: string }) {
  return (
    <div className="grid grid-cols-[24px_1fr] gap-2.5">
      <span className="grid size-6 place-items-center rounded-full border border-line bg-tint text-[9px] font-semibold text-accent">{number}</span>
      <div>
        <div className="font-medium text-ink">{title}</div>
        <p className="m-0 text-[10px] leading-4.5 text-muted">{children}</p>
      </div>
    </div>
  );
}
