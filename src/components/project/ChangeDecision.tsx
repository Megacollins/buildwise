"use client";

import { useState, useTransition } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { decideChangeAction } from "@/app/actions/agent";
import { Button, Notice, Textarea } from "@/components/ui";

export function ChangeDecision({ projectId, changeId, canApprove }: { projectId: string; changeId: string; canApprove: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decide = (d: "approve" | "reject") => start(async () => {
    setError(null);
    const r = await decideChangeAction(projectId, changeId, d, note);
    if (!r.ok) setError(r.error);
  });
  return (
    <div className="space-y-3">
      <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the decision record (optional)" aria-label="Decision note" />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending || !canApprove} onClick={() => decide("approve")}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Approve change
        </Button>
        <Button disabled={pending} onClick={() => decide("reject")}><X className="size-4" aria-hidden /> Reject</Button>
      </div>
      <p className="text-[12px] text-muted">Approving doesn&apos;t change the design by itself. The agent applies it next, and Buildwise checks this approval before saving a new version.</p>
    </div>
  );
}
