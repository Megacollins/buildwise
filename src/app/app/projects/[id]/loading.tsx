export default function Loading() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]" aria-busy="true" aria-label="Loading">
      <div className="aspect-[4/3] animate-pulse rounded-xl border border-line bg-surface" />
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    </div>
  );
}
