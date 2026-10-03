"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <AlertTriangle className="size-8 text-warn" aria-hidden />
      <h1 className="mt-4 font-display text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[14px] text-muted">Your saved designs are safe. Try again, and if the problem continues, reload the page.</p>
      {error.digest && <p className="mt-2 font-mono text-[11.5px] text-faint">Reference: {error.digest}</p>}
      <Button className="mt-6" variant="primary" onClick={reset}>Try again</Button>
    </div>
  );
}
