// Start serves one prerendered SPA shell for every URL, so pending markup must match.
export function RoutePending() {
  return (
    <main className="route-message loading-shell" role="status" aria-label="Loading Notespace">
      <div className="loading-layout">
        <section className="loading-copy" aria-label="Loading status">
          <div className="loading-brand"><span className="brand-mark">n<span>·</span></span><span>notespace</span><span className="brand-dot">.</span></div>
          <p className="loading-eyebrow">PERSONAL KNOWLEDGE WORKSPACE</p>
          <h1>Make space for better thinking.</h1>
          <p className="loading-description">Opening your library and workspaces.</p>
          <div className="loading-progress" aria-hidden="true"><span /></div>
          <div className="loading-state"><span className="loading-state-dot" aria-hidden="true" /><span>Preparing your workspace</span><span className="loading-state-mark" aria-hidden="true">···</span></div>
        </section>
        <div className="loading-preview" aria-hidden="true">
          <div className="loading-preview-topbar"><span className="loading-preview-brand" /><span className="loading-preview-command" /><span className="loading-preview-command loading-preview-command-short" /></div>
          <div className="loading-preview-body">
            <aside className="loading-preview-sidebar"><span className="loading-skeleton loading-preview-logo" /><span className="loading-skeleton loading-preview-nav" /><span className="loading-skeleton loading-preview-section" /><span className="loading-skeleton loading-preview-row" /><span className="loading-skeleton loading-preview-row loading-preview-row-short" /><span className="loading-skeleton loading-preview-row" /></aside>
            <div className="loading-preview-content"><span className="loading-skeleton loading-preview-kicker" /><span className="loading-skeleton loading-preview-heading" /><span className="loading-skeleton loading-preview-line" /><div className="loading-preview-list"><span className="loading-skeleton loading-preview-item" /><span className="loading-skeleton loading-preview-item" /><span className="loading-skeleton loading-preview-item loading-preview-item-short" /></div></div>
          </div>
        </div>
      </div>
    </main>
  );
}
