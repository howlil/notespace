// Start serves one prerendered SPA shell for every URL, so pending markup must match.
export function RoutePending() {
  return (
    <main className="route-message" role="status">
      Opening Notespace…
    </main>
  );
}
