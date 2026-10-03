"use client";

/** Last-resort error screen when the root layout itself fails. Must render its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0d0e", color: "#e8ebec", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Buildwise is having a problem</h1>
          <p style={{ color: "#9ba4a9", fontSize: 14, lineHeight: 1.6 }}>Your saved designs are safe. Please try again in a moment.</p>
          {error.digest && <p style={{ color: "#677177", fontSize: 12, fontFamily: "monospace" }}>Reference: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 16, background: "#2fb5a4", color: "#04201c", border: 0, borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
