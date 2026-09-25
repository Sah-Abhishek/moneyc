// Shown while a page's data loads. Keeps the page's shape so nothing jumps.
export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite" style={{ paddingTop: 32 }}>
      <span className="sr-only">Loading…</span>
      <div className="skeleton" style={{ height: 300 }} />
      <div className="skeleton" style={{ height: 24, width: "40%", marginTop: 32 }} />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 44, marginTop: 10, opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}
