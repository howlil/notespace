// Start serves one prerendered SPA shell for every URL, so pending markup must match.
export function RoutePending() {
  const skeleton = "block rounded-md bg-tint animate-soft-pulse";

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-5 overflow-hidden bg-background p-8 text-center max-[760px]:p-6"
      role="status"
      aria-label="Loading Notespace"
    >
      <div className="grid w-full max-w-[920px] grid-cols-[minmax(260px,.78fr)_minmax(360px,1.22fr)] items-center gap-[clamp(40px,8vw,96px)] text-left max-[760px]:grid-cols-1 max-[760px]:gap-[42px] max-[440px]:gap-[34px]">
        <section className="min-w-0" aria-label="Loading status">
          <div className="inline-flex items-center text-[19px] font-semibold tracking-[-.6px] text-ink">
            <span className="mr-[9px] inline-block size-6 rounded-[7px] bg-ink text-center text-xl font-medium leading-[22px] tracking-[-3px] text-surface">
              n<span className="text-accent">·</span>
            </span>
            <span>notespace</span><span className="text-accent">.</span>
          </div>
          <p className="mb-[15px] mt-[58px] text-[9px] font-semibold tracking-[1.4px] text-accent max-[760px]:mt-[43px]">OPENING NOTESPACE</p>
          <h1 className="m-0 max-w-[300px] text-[clamp(28px,4vw,40px)] font-medium leading-[1.08] tracking-[-1.5px] max-[440px]:text-[30px]">Loading your library.</h1>
          <p className="mb-0 mt-3.5 text-xs leading-[1.6] text-muted">Preparing your workspace.</p>
          <div className="mt-[31px] h-[3px] w-[180px] overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full w-[42%] animate-loading-progress rounded-[inherit] bg-accent" />
          </div>
          <div className="mt-3.5 flex items-center gap-2 text-[10px] text-muted">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_3px_var(--tint)]" aria-hidden="true" />
            <span>Preparing your workspace</span>
            <span className="ml-0.5 tracking-[2px] text-accent" aria-hidden="true">···</span>
          </div>
        </section>

        <div className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_18px_45px_color-mix(in_srgb,var(--ink)_7%,transparent)]" aria-hidden="true">
          <div className="flex h-[45px] items-center gap-2 border-b border-line px-4">
            <span className="mr-auto block h-[7px] w-[74px] rounded-full bg-ink opacity-[.82]" />
            <span className="block h-[7px] w-[42px] rounded-full bg-tint" />
            <span className="block h-[7px] w-[22px] rounded-full bg-tint" />
          </div>
          <div className="grid min-h-[292px] grid-cols-[132px_minmax(0,1fr)] max-[760px]:min-h-[220px] max-[440px]:min-h-[185px] max-[440px]:grid-cols-[92px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-[13px] border-r border-line bg-sidebar px-[18px] py-[23px] max-[440px]:px-3 max-[440px]:py-[18px]">
              <span className={`${skeleton} mb-[15px] h-[9px] w-[75px] bg-ink opacity-80`} />
              <span className={`${skeleton} h-2 w-[58px]`} />
              <span className={`${skeleton} mt-5 h-1.5 w-[43px] opacity-70`} />
              <span className={`${skeleton} h-2 w-[88px] max-[440px]:w-[63px]`} />
              <span className={`${skeleton} h-2 w-[68px] max-[440px]:w-[63px]`} />
              <span className={`${skeleton} h-2 w-[88px] max-[440px]:w-[63px]`} />
            </aside>
            <div className="px-[31px] py-[37px] max-[760px]:px-[22px] max-[760px]:py-[27px] max-[440px]:px-4 max-[440px]:py-[22px]">
              <span className={`${skeleton} h-1.5 w-12 opacity-70`} />
              <span className={`${skeleton} mt-3.5 h-[22px] w-[min(74%,220px)] rounded-[5px]`} />
              <span className={`${skeleton} mt-3 h-[7px] w-[min(52%,160px)]`} />
              <div className="mt-[37px] grid gap-2.5 border-t border-line pt-4 max-[440px]:mt-[25px]">
                <span className={`${skeleton} h-9 w-full border border-line bg-transparent`} />
                <span className={`${skeleton} h-9 w-full border border-line bg-transparent`} />
                <span className={`${skeleton} h-9 w-[78%] border border-line bg-transparent`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
