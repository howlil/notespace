import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, CircleHelp, FileText, Layers, Target, Timer, X } from "lucide-react";
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
    eyebrow: "Session focus",
    title: "Study one smaller question at a time.",
    description: "A workspace can last for days. A session only needs one clear objective for what you want to understand now.",
  },
  {
    eyebrow: "Know when to split",
    title: "A new central question means a new workspace.",
    description: "Split when the topic stops behaving like one mental model. You do not need to finish a chapter before moving on.",
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
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[86dvh] w-[min(900px,calc(100vw_-_32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-[0_24px_70px_#0004] max-[640px]:inset-2 max-[640px]:max-h-none max-[640px]:w-auto max-[640px]:translate-x-0 max-[640px]:translate-y-0"
          >
            <header className="flex shrink-0 items-start justify-between gap-5 border-b border-line px-6 py-5 max-[640px]:px-4 max-[640px]:py-4">
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

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-[640px]:px-4 max-[640px]:py-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <div className="mb-4 max-w-[620px]">
                    <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-accent">{current.eyebrow}</div>
                    <h2 className="mt-1.5 mb-0 text-[21px] font-medium leading-tight tracking-[-.4px] text-ink max-[640px]:text-[18px]">{current.title}</h2>
                    <p className="mt-2 mb-0 text-[11px] leading-5 text-muted">{current.description}</p>
                  </div>

                  <WorkspacePreview step={step} />
                  <StepTakeaway step={step} />
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-3.5 max-[640px]:px-4">
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

function WorkspacePreview({ step }: { step: number }) {
  return (
    <div className="relative mx-auto max-w-[760px] pt-9 max-[640px]:pt-6">
      <div className="overflow-hidden rounded-xl border border-line bg-background shadow-[0_10px_28px_#0001]">
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line bg-surface px-3.5">
          <div className="relative min-w-0">
            <div className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-ink ${step === 0 ? "relative z-10" : ""}`}>Virtual Memory</div>
            <div className="text-[8px] text-muted">Operating Systems</div>
            {step === 0 && <ScribbleCircle className="-top-2.5 -left-2 h-9 w-[105px]" />}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`hidden items-center gap-1 rounded-md px-2 py-1 text-[8px] min-[450px]:inline-flex ${step === 2 ? "relative z-10 border border-accent bg-tint text-accent" : "bg-tint text-accent"}`}><Target size={9} /> Understand page replacement</span>
            <span className="inline-flex items-center gap-1 text-[8px] text-muted"><Timer size={10} /> 32m</span>
            <span className="rounded-md border border-line bg-surface px-2 py-1 text-[8px] text-ink">End</span>
          </div>
        </div>

        {step === 3 ? <SplitPreview /> : <StudyPreview step={step} />}
      </div>

      {step === 0 && <GuideAnnotation className="top-0 left-[8%]" label="Workspace = one topic" path="M8 6 C 35 2, 70 5, 96 16 C 103 20, 107 25, 110 32" />}
      {step === 1 && <>
        <GuideAnnotation className="bottom-[7%] left-[5%] max-[640px]:hidden" label="Notes = details" path="M92 7 C 68 10, 42 17, 18 36" reverse />
        <GuideAnnotation className="right-[4%] bottom-[7%] max-[640px]:hidden" label="Canvas = relationships" path="M8 7 C 35 10, 63 17, 88 36" />
      </>}
      {step === 2 && <GuideAnnotation className="top-0 right-[18%] max-[520px]:right-[8%]" label="Goal = today's focus" path="M93 5 C 71 6, 46 11, 22 31" reverse />}
      {step === 3 && <GuideAnnotation className="top-0 left-[31%] max-[640px]:left-[14%]" label="New question? Split here." path="M8 6 C 38 7, 70 12, 103 33" />}
    </div>
  );
}

function StudyPreview({ step }: { step: number }) {
  return (
    <div className="grid min-h-[290px] grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] max-[520px]:grid-cols-1">
      <div className={`border-r border-line bg-surface max-[520px]:border-r-0 max-[520px]:border-b ${step === 1 ? "relative" : ""}`}>
        <div className="flex h-8 items-center gap-1.5 border-b border-line px-3 text-[9px] font-medium text-ink"><FileText size={11} /> Page Replacement</div>
        <div className="p-4 text-[9px] leading-4 text-muted">
          <div className="mb-2 text-[12px] font-semibold text-ink">Page Replacement</div>
          <p className="m-0">When a page fault occurs, the OS chooses a page to evict from physical memory.</p>
          <ul className="mt-2 mb-0 grid gap-1 pl-3.5">
            <li>FIFO replaces the oldest page.</li>
            <li>LRU approximates recent use.</li>
            <li>Belady anomaly can appear with FIFO.</li>
          </ul>
          <div className="mt-4 border-l-2 border-accent pl-2 text-[8px] text-ink">Key takeaway: replacement is a local decision with global performance effects.</div>
        </div>
        {step === 1 && <ScribbleUnderline className="absolute right-6 bottom-7 left-6" />}
      </div>

      <div className={`bg-surface ${step === 1 ? "relative" : ""}`}>
        <div className="flex h-8 items-center gap-1.5 border-b border-line px-3 text-[9px] font-medium text-ink"><Layers size={11} /> Canvas</div>
        <div className="grid min-h-[257px] place-items-center bg-canvas p-4">
          <div className="grid w-full max-w-[240px] justify-items-center gap-2">
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
        {step === 1 && <ScribbleUnderline className="absolute right-6 bottom-7 left-6" />}
      </div>
    </div>
  );
}

function SplitPreview() {
  return (
    <div className="grid min-h-[290px] place-items-center bg-canvas p-6 max-[520px]:p-4">
      <div className="grid w-full max-w-[610px] grid-cols-[1fr_48px_1fr] items-center gap-3 max-[520px]:grid-cols-1">
        <div className="rounded-lg border border-accent bg-tint p-4">
          <div className="text-[8px] font-semibold uppercase tracking-[.1em] text-accent">Keep together</div>
          <div className="mt-1 text-[12px] font-semibold text-ink">Virtual Memory</div>
          <div className="mt-3 grid gap-1.5 text-[9px] text-muted">
            <span>Address translation</span><span>Page faults</span><span>Replacement</span><span>TLB</span>
          </div>
          <div className="mt-3 text-[8px] text-ink">All answer the same central question.</div>
        </div>
        <div className="text-center text-[15px] text-muted max-[520px]:rotate-90">→</div>
        <div className="grid gap-2">
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="text-[8px] text-muted">New central question</div>
            <div className="mt-1 text-[11px] font-semibold text-ink">CPU Scheduling</div>
          </div>
          <div className="rounded-md border border-dashed border-line px-3 py-2 text-[8px] leading-4 text-muted">Different mental model → create another workspace.</div>
        </div>
      </div>
    </div>
  );
}

function StepTakeaway({ step }: { step: number }) {
  if (step === 0) return <div className="mx-auto mt-4 grid max-w-[760px] grid-cols-2 gap-2 max-[520px]:grid-cols-1"><ExampleCard label="Too broad" value="Operating Systems · Chapters 1–12" muted /><ExampleCard label="Good workspace" value="Virtual Memory" /></div>;
  if (step === 1) return <p className="mx-auto mt-4 max-w-[760px] text-center text-[10px] leading-5 text-muted">Do not duplicate everything on Canvas. Use it to expose the relationships you would otherwise have to hold in your head.</p>;
  if (step === 2) return <div className="mx-auto mt-4 max-w-[760px] rounded-lg border border-line bg-background px-4 py-3 text-[10px] leading-5"><span className="text-muted">Workspace:</span> <strong className="font-medium text-ink">Virtual Memory</strong><span className="mx-2 text-line">→</span><span className="text-muted">Today:</span> <strong className="font-medium text-ink">Understand why page replacement is needed</strong></div>;
  return <p className="mx-auto mt-4 max-w-[760px] text-center text-[10px] leading-5 text-muted">Simple test: if the central question changes, create a new workspace. Chapter boundaries do not decide this for you.</p>;
}

function ExampleCard({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2"><span className="text-[9px] text-muted">{label}</span><strong className={`text-right text-[10px] font-medium ${muted ? "text-muted line-through" : "text-ink"}`}>{value}</strong></div>;
}

function GuideAnnotation({ label, path, className = "", reverse = false }: { label: string; path: string; className?: string; reverse?: boolean }) {
  return (
    <div className={`pointer-events-none absolute z-20 text-accent ${className}`} aria-hidden="true">
      <div className={`${reverse ? "-rotate-2" : "rotate-[-2deg]"} whitespace-nowrap text-[10px] font-semibold tracking-[.01em]`}>{label}</div>
      <motion.svg className={`mt-0.5 h-10 w-28 overflow-visible ${reverse ? "-scale-x-100" : ""}`} viewBox="0 0 120 42" fill="none">
        <motion.path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.42, ease: "easeOut", delay: 0.08 }} />
        <motion.path d="M103 27 L111 33 L102 36" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.16, delay: 0.42 }} />
      </motion.svg>
    </div>
  );
}

function ScribbleCircle({ className = "" }: { className?: string }) {
  return <motion.svg className={`pointer-events-none absolute z-0 overflow-visible text-accent ${className}`} viewBox="0 0 112 38" fill="none" aria-hidden="true"><motion.path d="M5 20 C7 5 33 1 59 3 C88 4 108 10 106 21 C104 34 77 36 50 35 C22 35 2 30 5 20 Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: "easeOut" }} /></motion.svg>;
}

function ScribbleUnderline({ className = "" }: { className?: string }) {
  return <motion.svg className={`pointer-events-none h-3 overflow-visible text-accent ${className}`} viewBox="0 0 220 12" fill="none" aria-hidden="true"><motion.path d="M3 7 C51 11 91 3 135 7 C165 9 190 5 217 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.38, ease: "easeOut", delay: 0.1 }} /></motion.svg>;
}
