import { motion } from "motion/react";
import { BookOpen, CircleHelp, FileText, Layers, Target, Timer, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";

const annotationClass = "rounded-md border border-line bg-surface px-2.5 py-2";
const canvasNodeClass = "rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[9px] font-medium text-ink";

export function WorkspaceGuide() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissablePopup(rootRef, open, dismiss);

  return (
    <div ref={rootRef} className="relative shrink-0 [.workspace-header_&]:hidden">
      <IconButton
        className="size-[30px]"
        aria-label="How to use Notespace"
        title="How to use Notespace"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp size={17} />
      </IconButton>

      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close Notespace guide"
            className="fixed inset-0 z-40 cursor-default border-0 bg-black/20 p-0 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={dismiss}
          />
          <motion.aside
            role="dialog"
            aria-label="How to use Notespace"
            initial={{ opacity: 0, x: 12, scale: 0.99 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.17, ease: "easeOut" }}
            className="fixed top-3 right-3 bottom-3 z-50 flex w-[min(480px,calc(100vw_-_24px))] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-[0_24px_70px_#0004] max-[560px]:top-2 max-[560px]:right-2 max-[560px]:bottom-2 max-[560px]:left-2 max-[560px]:w-auto"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold"><BookOpen size={16} className="text-accent" /> How to use Notespace</div>
                <p className="mt-1 mb-0 max-w-[390px] text-[11px] leading-5 text-muted">Keep each workspace focused on one topic you want to understand. Notes hold the detail; Canvas shows the mental model.</p>
              </div>
              <IconButton className="-mt-1 -mr-1 size-7" aria-label="Close Notespace guide" onClick={dismiss}><X size={14} /></IconButton>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <section aria-labelledby="workspace-guide-preview-title">
                <div className="mb-2 flex items-end justify-between gap-4">
                  <div>
                    <div id="workspace-guide-preview-title" className="text-[11px] font-semibold">A focused workspace</div>
                    <p className="mt-0.5 mb-0 text-[10px] leading-4 text-muted">This preview uses the same visual language as the real workspace.</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-line bg-tint px-2 py-1 text-[9px] text-accent">1 topic</span>
                </div>

                <div className="overflow-hidden rounded-xl border border-line bg-background shadow-[0_10px_28px_#0001]">
                  <div className="flex min-h-10 items-center justify-between gap-2 border-b border-line bg-surface px-3">
                    <div className="min-w-0">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-semibold text-ink">Virtual Memory</div>
                      <div className="text-[8px] text-muted">Operating Systems</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="hidden items-center gap-1 rounded-md bg-tint px-2 py-1 text-[8px] text-accent min-[420px]:inline-flex"><Target size={9} /> Understand page replacement</span>
                      <span className="inline-flex items-center gap-1 text-[8px] text-muted"><Timer size={10} /> 32m</span>
                      <span className="rounded-md border border-line bg-surface px-2 py-1 text-[8px] text-ink">End</span>
                    </div>
                  </div>

                  <div className="grid min-h-[215px] grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] max-[420px]:grid-cols-1">
                    <div className="border-r border-line bg-surface max-[420px]:border-r-0 max-[420px]:border-b">
                      <div className="flex h-8 items-center gap-1.5 border-b border-line px-3 text-[9px] font-medium text-ink"><FileText size={11} /> Page Replacement</div>
                      <div className="p-3 text-[9px] leading-4 text-muted">
                        <div className="mb-2 text-[11px] font-semibold text-ink">Page Replacement</div>
                        <p className="m-0">When a page fault occurs, the OS chooses a page to evict from physical memory.</p>
                        <ul className="mt-2 mb-0 grid gap-1 pl-3.5">
                          <li>FIFO replaces the oldest page.</li>
                          <li>LRU approximates recent use.</li>
                          <li>Belady anomaly can appear with FIFO.</li>
                        </ul>
                        <div className="mt-3 border-l-2 border-accent pl-2 text-[8px] text-ink">Key takeaway: replacement is a local decision with global performance effects.</div>
                      </div>
                    </div>

                    <div className="bg-surface">
                      <div className="flex h-8 items-center gap-1.5 border-b border-line px-3 text-[9px] font-medium text-ink"><Layers size={11} /> Canvas</div>
                      <div className="grid min-h-[182px] place-items-center bg-canvas p-3">
                        <div className="grid w-full max-w-[210px] justify-items-center gap-1.5">
                          <div className={`${canvasNodeClass} min-w-[92px]`}>Page fault</div>
                          <span className="text-[10px] text-muted">↓</span>
                          <div className={`${canvasNodeClass} min-w-[110px] border-accent bg-tint`}>Replacement</div>
                          <div className="grid w-full grid-cols-[1fr_28px_1fr] items-start pt-1">
                            <div className="grid justify-items-center gap-1"><span className="text-[9px] text-muted">↙</span><div className={`${canvasNodeClass} min-w-[64px]`}>FIFO</div></div>
                            <div />
                            <div className="grid justify-items-center gap-1"><span className="text-[9px] text-muted">↘</span><div className={`${canvasNodeClass} min-w-[64px]`}>LRU</div></div>
                          </div>
                          <div className="mt-1 rounded-md border border-dashed border-line px-2 py-1 text-[8px] text-muted">Question: why can more frames cause more faults?</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
                  <div className={annotationClass}><div className="text-[9px] font-semibold text-ink">Workspace boundary</div><p className="mt-0.5 mb-0 text-[9px] leading-4 text-muted">Use one workspace for one coherent topic, such as Virtual Memory—not an entire course.</p></div>
                  <div className={annotationClass}><div className="text-[9px] font-semibold text-ink">Session goal</div><p className="mt-0.5 mb-0 text-[9px] leading-4 text-muted">Keep one short objective visible so the current study session has a clear boundary.</p></div>
                  <div className={annotationClass}><div className="text-[9px] font-semibold text-ink">Notes = detail</div><p className="mt-0.5 mb-0 text-[9px] leading-4 text-muted">Definitions, explanations, examples, steps, and references belong in notes.</p></div>
                  <div className={annotationClass}><div className="text-[9px] font-semibold text-ink">Canvas = relationships</div><p className="mt-0.5 mb-0 text-[9px] leading-4 text-muted">Use the canvas to see how concepts connect rather than duplicating paragraphs.</p></div>
                </div>
              </section>

              <section className="mt-5 border-t border-line pt-4">
                <div className="text-[11px] font-semibold">How to size your material</div>
                <p className="mt-1 mb-0 text-[10px] leading-5 text-muted">A chapter is only a source boundary. Your workspace boundary is the mental model you are trying to build.</p>
                <div className="mt-3 grid gap-2">
                  <GuideExample label="Too broad" value="Operating Systems · Chapters 1–12" muted />
                  <GuideExample label="Good workspace" value="Virtual Memory" />
                  <GuideExample label="Good session" value="Understand why page replacement is needed" />
                </div>
              </section>

              <section className="mt-5 border-t border-line pt-4">
                <div className="text-[11px] font-semibold">Create a new workspace when</div>
                <div className="mt-2 grid gap-2 text-[10px] leading-4.5 text-muted">
                  <BoundaryRule number="01">the central question changes;</BoundaryRule>
                  <BoundaryRule number="02">the canvas starts mixing several independent mental models;</BoundaryRule>
                  <BoundaryRule number="03">you cannot explain the whole workspace as one main idea.</BoundaryRule>
                </div>
              </section>

              <section className="mt-5 rounded-lg border border-line bg-background p-3">
                <div className="mb-2 text-[9px] font-semibold uppercase tracking-[.08em] text-muted">Notespace structure</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                  <StructureChip>Category</StructureChip><span className="text-muted">→</span>
                  <StructureChip active>Workspace</StructureChip><span className="text-muted">→</span>
                  <StructureChip>Session</StructureChip><span className="text-muted">→</span>
                  <StructureChip>Note / Canvas</StructureChip><span className="text-muted">→</span>
                  <StructureChip>Gap</StructureChip>
                </div>
                <p className="mt-2 mb-0 text-[9px] leading-4 text-muted">Course/domain → topic → today's objective → detail/relationships → what is still unclear.</p>
              </section>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-3">
              <span className="text-[9px] text-muted">No setup required. Open this guide whenever you need the boundary again.</span>
              <Button size="sm" onClick={dismiss}>Got it</Button>
            </footer>
          </motion.aside>
        </>
      )}
    </div>
  );
}

function BoundaryRule({ number, children }: { number: string; children: string }) {
  return <div className="grid grid-cols-[22px_1fr] items-start gap-2"><span className="grid size-[22px] place-items-center rounded-full border border-line bg-tint text-[8px] font-semibold text-accent">{number}</span><span className="pt-0.5">{children}</span></div>;
}

function GuideExample({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2"><span className="text-[9px] text-muted">{label}</span><strong className={`text-right text-[10px] font-medium ${muted ? "text-muted line-through" : "text-ink"}`}>{value}</strong></div>;
}

function StructureChip({ children, active = false }: { children: string; active?: boolean }) {
  return <span className={`rounded-md border px-2 py-1 ${active ? "border-accent bg-tint text-accent" : "border-line bg-surface text-ink"}`}>{children}</span>;
}
