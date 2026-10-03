"use client";

import { useState, useTransition } from "react";
import { requestReviewAction } from "@/app/actions/projects";
import { Button, Field, Notice, Select, Textarea } from "@/components/ui";
import { PRO_CATEGORIES } from "@/domain/professionals";



export function ReviewRequestForm({ projectId }: { projectId: string }) {
  const [category, setCategory] = useState("ARCHITECT");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (done) return <Notice tone="ok" title="Request recorded">We’ve saved your request against the current design version. You’ll be matched when verified professionals are available in your region.</Notice>;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await requestReviewAction(projectId, category, message); if (r.ok) setDone(true); else setError(r.error); }); }}>
      {error && <Notice tone="warn">{error}</Notice>}
      <Field label="Type of professional" htmlFor="cat">
        <Select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          {PRO_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="What would you like reviewed? (optional)" htmlFor="msg">
        <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="e.g. Check the structure for a two-storey concrete frame and confirm setbacks." />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>Request professional review</Button>
    </form>
  );
}
