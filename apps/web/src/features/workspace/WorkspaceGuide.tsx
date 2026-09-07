import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, FileText, Layers, Maximize2, MoreHorizontal, Pause, Plus, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";

const STEP_COUNT = 4;
const canvasNodeClass = "rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[9px] font-medium text-ink";

const steps = [
  {
    eyebrow: "Workspace boundary",
    title: "One workspace, one mental model.",
    description: "Use a workspace for one coherent topic you want to understand—not an entire course or book.",
  },
  {
    eyebrow: "Two surfaces, two jobs",
    title: "Notes hold detail. Canvas holds relationships.",
    description: "Keep explanations and examples in Notes, then use Canvas to make the structure visible.",
  },
  {
    eyebrow: "Study session",
    title: "A workspace can span many sessions.",
    description: "Start, pause, resume, and end each study session manually. The workspace stays as the long-lived topic container.",
  },
  {
    eyebrow: "Know when to split",
    title: "A new central question means a new workspace.",
    description: "Split when the topic stops behaving like one mental model. Chapter boundaries do not decide this for you.",
  },
] as const;

export function WorkspaceGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useDismissablePopup(rootRef, open, dismiss);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setStep((value) => Math.min(STEP_COUNT - 1, value + 1));
      if (event.key === "ArrowLeft") setStep((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openGuide() {
    setStep(0);
    setOpen(true);
  }

  const current = steps[step];
  const lastStep = step === STEP_COUNT - 1;

  return (
    <div ref={rootRef} className="relative shrink-0 [.workspace-header_&]:hidden">
      <IconButton
        className="size-[30px]"
        aria-label="How to use Notespace"
        title="How to use Notespace"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => open ? dismiss() : openGuide()}
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
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="How Notespace works"
            initial={{ opacity: 0, y: 6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.17, ease: "easeOut" }}
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[86dvh] w-[min(960px,calc(100vw_-_32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-[0_24px_70px_#0004] max-[640px]:inset-2 max-[640px]:max-h-none max-[640px]:w-auto max-[640px]:translate-x-0 max-[640px]:translate-y-0"
          >
            <header className="flex shrink-0 items-start justify-between gap-5 border-b border-line px-6 py-4 max-[640px]:px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold"><BookOpen size={16} className="text-accent" /> How Notespace works</div>
                <p className="mt-1 mb-0 text-[11px] leading-5 text-muted">A short visual guide to keeping study sessions focused.</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="hidden text-right min-[440px]:block">
                  <div className="text-[10px] font-medium text-ink">{step + 1} of {STEP_COUNT}</div>
                  <div className="mt-1 flex justify-end gap-1" aria-hidden="true">
                    {steps.map((_, index) => <span key={index} className={`size-1.5 rounded-full ${index === step ? "bg-accent" : "bg-line"}`} />)}
                  </div>
                </div>
                <IconButton className="size-7" aria-label="Close Notespace guide" onClick={dismiss}><X size={14} /></IconButton>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 max-[640px]:px-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <div className="mb-3 max-w-[660px]">
                    <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-accent">{current.eyebrow}</div>
                    <h2 className="mt-1.5 mb-0 text-[21px] font-medium leading-tight tracking-[-.4px] text-ink max-[640px]:text-[18px]">{current.title}</h2>
                    <p className="mt-1.5 mb-0 text-[11px] leading-5 text-muted">{current.description}</p>
                  </div>

                  {step === 3 ? <SplitBoundaryPreview /> : <FaithfulWorkspacePreview step={step} />}
                  <StepTakeaway step={step} />
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-3 max-[640px]:px-4">
              <button type="button" className="border-0 bg-transparent px-1 py-1.5 text-[10px] text-muted hover:text-ink focus-visible:text-ink" onClick={dismiss}>Skip</button>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft size={13} /> Back</Button>
                <Button size="sm" onClick={() => lastStep ? dismiss() : setStep((value) => Math.min(STEP_COUNT - 1, value + 1))}>
                  {lastStep ? "Got it" : <>Next <ArrowRight size={13} /></>}
                </Button>
              </div>
            </footer>
          </motion.section>
        </>
      )}
    </div>
  );
}

function FaithfulWorkspacePreview({ step }: { step: number }) {
  return (
    <div className="relative mx-auto max-w-[820px] pt-10 max-[640px]:pt-8">
      {step === 0 && <TargetAnnotation className="top-0 left-[16%] max-[560px]:left-[7%]" label="One topic lives here" direction="down-right" />}
      {step === 1 && <>
        <TargetAnnotation className="top-0 left-[12%] max-[560px]:hidden" label="Notes keep detail" direction="down" />
        <TargetAnnotation className="top-0 right-[10%] max-[560px]:hidden" label="Canvas shows structure" direction="down" />
      </>}
      {step === 2 && <TargetAnnotation className="top-0 right-[12%] max-[560px]:right-[4%]" label="Control each session here" direction="down-left" />}

      <div className="overflow-hidden rounded-xl border border-line bg-background shadow-[0_10px_28px_#0001]">
        <div className="flex min-h-[54px] items-center justify-between gap-2 border-b border-line bg-surface px-[14px] max-[640px]:min-h-[48px] max-[640px]:px-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-[7px]">
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] text-muted"><ArrowLeft size={15} /></span>
            <span className="max-w-[125px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted max-[560px]:hidden">Operating Systems /</span>
            <div className="relative min-w-0">
              <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[11px] font-medium text-ink">Virtual Memory</span>
              {step === 0 && <ScribbleCircle className="-top-2 -left-1.5 h-8 w-[104px]" />}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 max-[560px]:gap-0.5">
            <div className={`relative flex items-center gap-1 ${step === 2 ? "z-10" : ""}`}>
              <span className="inline-flex min-h-7 items-center gap-[5px] rounded-md px-1.5 py-1 text-[9px] text-muted"><span className="text-success">●</span>32m</span>
              <span className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[9px] text-ink"><Pause size={10} /> <span className="max-[700px]:hidden">Pause</span></span>
              <span className="inline-flex min-h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[9px] text-ink"><Square size={9} /> <span className="max-[700px]:hidden">End</span></span>
              {step === 2 && <ScribbleBracket className="-right-1 -bottom-2 left-0" />}
            </div>
            <span className="hidden items-center gap-1 text-[9px] text-muted min-[700px]:inline-flex"><Check size={11} className="text-success" /> Saved</span>
            <span className="grid size-7 place-items-center text-muted"><MoreHorizontal size={14} /></span>
            <span className="grid size-7 place-items-center text-muted"><Maximize2 size={13} /></span>
          </div>
        </div>

        <div className="p-3 max-[640px]:p-2">
          <div className="grid min-h-[300px] grid-cols-[minmax(0,.95fr)_7px_minmax(0,1.05fr)] overflow-hidden rounded-lg border border-line bg-surface max-[560px]:grid-cols-1 max-[560px]:grid-rows-[minmax(0,1fr)_7px_minmax(0,1fr)]">
            <div className="relative grid min-h-0 grid-rows-[34px_minmax(0,1fr)] bg-surface">
              <div className="flex min-w-0 items-center justify-between gap-2 border-b border-line pr-2 pl-[11px]">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-ink"><FileText size={13} /><span>Page Replacement</span><ChevronDown size={11} /></div>
                <div className="ml-auto flex items-center gap-0.5"><span className="grid size-6 place-items-center text-muted"><Plus size={12} /></span><span className="grid size-6 place-items-center text-muted"><MoreHorizontal size={13} /></span></div>
              </div>
              <div className="p-4 text-[9px] leading-4 text-muted max-[640px]:p-3">
                <div className="mb-2 text-[12px] font-semibold text-ink">Page Replacement</div>
                <p className="m-0">When a page fault occurs, the OS chooses a page to evict from physical memory.</p>
                <ul className="mt-2 mb-0 grid gap-1 pl-3.5">
                  <li>FIFO replaces the oldest page.</li>
                  <li>LRU approximates recent use.</li>
                  <li>Belady anomaly can appear with FIFO.</li>
                </ul>
                <div className="mt-4 border-l-2 border-accent pl-2 text-[8px] text-ink">Key takeaway: replacement policy changes memory behavior.</div>
              </div>
              {step === 1 && <ScribbleCorner className="top-9 right-2 bottom-2 left-2" />}
            </div>

            <div className="relative bg-background after:absolute after:top-1/2 after:left-1/2 after:h-[14px] after:w-[3px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-line after:content-[''] max-[560px]:after:h-[3px] max-[560px]:after:w-[14px]" />

            <div className="relative grid min-h-0 grid-rows-[34px_minmax(0,1fr)] bg-surface">
              <div className="flex min-w-0 items-center justify-between gap-2 border-b border-line pr-2 pl-[11px]">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-ink"><Layers size={13} /> Canvas</span>
                <span className="grid size-6 place-items-center text-muted"><MoreHorizontal size={13} /></span>
              </div>
              <div className="grid min-h-[266px] place-items-center bg-canvas p-4">
                <div className="grid w-full max-w-[235px] justify-items-center gap-2">
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
              {step === 1 && <ScribbleCorner className="top-9 right-2 bottom-2 left-2" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitBoundaryPreview() {
  return (
    <div className="relative mx-auto max-w-[820px] pt-10 max-[640px]:pt-8">
      <TargetAnnotation className="top-0 left-1/2 -translate-x-1/2" label="Central question changed → new workspace" direction="down" />
      <div className="rounded-xl border border-line bg-background p-5 shadow-[0_10px_28px_#0001] max-[640px]:p-3">
        <div className="mb-3 text-[9px] font-semibold uppercase tracking-[.1em] text-muted">Category · Operating Systems</div>
        <div className="grid grid-cols-[1fr_54px_1fr] items-center gap-3 max-[560px]:grid-cols-1">
          <div className="rounded-lg border border-accent bg-tint p-4">
            <div className="text-[8px] font-semibold uppercase tracking-[.1em] text-accent">Same mental model</div>
            <div className="mt-1 text-[13px] font-semibold text-ink">Virtual Memory</div>
            <div className="mt-3 grid gap-1.5 text-[9px] text-muted"><span>Address translation</span><span>Page faults</span><span>Replacement</span><span>TLB</span></div>
            <div className="mt-3 text-[8px] text-ink">Keep these together.</div>
          </div>
          <div className="grid justify-items-center gap-1 text-center text-accent max-[560px]:rotate-90"><span className="text-[8px] font-medium">split</span><ArrowRight size={18} /></div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="text-[8px] font-semibold uppercase tracking-[.1em] text-muted">New central question</div>
            <div className="mt-1 text-[13px] font-semibold text-ink">CPU Scheduling</div>
            <div className="mt-3 grid gap-1.5 text-[9px] text-muted"><span>Scheduling policy</span><span>Context switching</span><span>Priorities</span></div>
            <div className="mt-3 text-[8px] text-ink">Create another workspace.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTakeaway({ step }: { step: number }) {
  if (step === 0) return <div className="mx-auto mt-3 grid max-w-[820px] grid-cols-2 gap-2 max-[520px]:grid-cols-1"><ExampleCard label="Too broad" value="Operating Systems · Chapters 1–12" muted /><ExampleCard label="Good workspace" value="Virtual Memory" /></div>;
  if (step === 1) return <p className="mx-auto mt-3 max-w-[820px] text-center text-[10px] leading-5 text-muted">Do not duplicate paragraphs on Canvas. Use it for the relationships you would otherwise have to hold in your head.</p>;
  if (step === 2) return <div className="mx-auto mt-3 flex max-w-[820px] flex-wrap items-center justify-center gap-2 text-[10px] text-muted"><span className="rounded-md border border-line bg-surface px-2.5 py-1.5">Start</span><span>→</span><span className="rounded-md border border-line bg-surface px-2.5 py-1.5">Pause / Resume</span><span>→</span><span className="rounded-md border border-line bg-surface px-2.5 py-1.5">End</span></div>;
  return <p className="mx-auto mt-3 max-w-[820px] text-center text-[10px] leading-5 text-muted">If the central question changes, create a new workspace. You do not need to finish a chapter first.</p>;
}

function ExampleCard({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2"><span className="text-[9px] text-muted">{label}</span><strong className={`text-right text-[10px] font-medium ${muted ? "text-muted line-through" : "text-ink"}`}>{value}</strong></div>;
}

function TargetAnnotation({ label, className = "", direction }: { label: string; className?: string; direction: "down" | "down-left" | "down-right" }) {
  const path = direction === "down" ? "M60 4 C60 13 60 22 60 34" : direction === "down-left" ? "M108 5 C85 7 58 14 31 34" : "M12 5 C34 7 61 14 89 34";
  const head = direction === "down" ? "M54 28 L60 35 L66 28" : direction === "down-left" ? "M37 27 L30 35 L40 34" : "M82 28 L90 35 L88 25";
  return (
    <div className={`pointer-events-none absolute z-20 text-accent ${className}`} aria-hidden="true">
      <div className="whitespace-nowrap text-[10px] font-semibold tracking-[.01em]">{label}</div>
      <motion.svg className="mx-auto mt-0.5 h-9 w-[120px] overflow-visible" viewBox="0 0 120 40" fill="none">
        <motion.path d={path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.36, ease: "easeOut", delay: 0.05 }} />
        <motion.path d={head} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.14, delay: 0.34 }} />
      </motion.svg>
    </div>
  );
}

function ScribbleCircle({ className = "" }: { className?: string }) {
  return <motion.svg className={`pointer-events-none absolute z-0 overflow-visible text-accent ${className}`} viewBox="0 0 112 38" fill="none" aria-hidden="true"><motion.path d="M5 20 C7 5 33 1 59 3 C88 4 108 10 106 21 C104 34 77 36 50 35 C22 35 2 30 5 20 Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.42, ease: "easeOut" }} /></motion.svg>;
}

function ScribbleBracket({ className = "" }: { className?: string }) {
  return <motion.svg className={`pointer-events-none absolute h-3 overflow-visible text-accent ${className}`} viewBox="0 0 150 12" preserveAspectRatio="none" fill="none" aria-hidden="true"><motion.path d="M3 3 C30 7 55 7 74 6 C96 6 121 6 147 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: "easeOut", delay: 0.12 }} /></motion.svg>;
}

function ScribbleCorner({ className = "" }: { className?: string }) {
  return <motion.svg className={`pointer-events-none absolute overflow-visible text-accent ${className}`} viewBox="0 0 200 160" preserveAspectRatio="none" fill="none" aria-hidden="true"><motion.path d="M7 32 C7 14 18 8 35 8 M7 32 L7 126 C7 142 16 150 32 150 M168 150 C184 150 193 142 193 126" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }} /></motion.svg>;
}
