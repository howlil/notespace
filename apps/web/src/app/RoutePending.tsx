// Start serves one prerendered SPA shell for every URL, so pending markup must match.
export function RoutePending() {
  return (
    <main className="route-message loading-shell" role="status" aria-label="Loading Notespace">
      <div className="loading-brand"><span className="brand-mark">n<span>·</span></span><span>notespace</span></div>
      <div className="loading-skeleton loading-skeleton-title" />
      <div className="loading-skeleton loading-skeleton-card" />
      <span className="loading-label">Opening Notespace…</span>
    </main>
  );
}
