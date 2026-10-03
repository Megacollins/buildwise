export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl border border-line bg-surface" />)}
      </div>
    </div>
  );
}
