import "server-only";

/**
 * Outbound email.
 *
 * Provider selection:
 *  - RESEND_API_KEY set → sends through Resend (https://resend.com).
 *  - Otherwise, in development → prints the email (and its links) to the server log.
 *  - Otherwise, in production → refuses to "send" and logs an error, so a
 *    misconfigured deployment never silently drops reset or verification emails.
 */
export interface OutboundEmail { to: string; subject: string; text: string; html: string }

export async function sendEmail(email: OutboundEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      console.error("[email] EMAIL_FROM is not set; cannot send.");
      return false;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      });
      if (!res.ok) console.error(`[email] provider rejected message (${res.status}): ${await res.text()}`);
      return res.ok;
    } catch (e) {
      console.error("[email] provider request failed", e);
      return false;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`\n──── [dev email] ────\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n─────────────────────\n`);
    return true;
  }
  console.error("[email] No email provider configured (set RESEND_API_KEY and EMAIL_FROM).");
  return false;
}

/**
 * Absolute app URL for links in emails. Taken from configuration, never from the
 * request's Host header (which an attacker could forge to hijack reset links).
 */
export function appUrl(path: string) {
  const base = process.env.APP_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null);
  if (!base) throw new Error("APP_URL must be set in production");
  return new URL(path, base).toString();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function actionEmail(opts: { to: string; subject: string; greeting: string; body: string; action: string; url: string; footer: string }): OutboundEmail {
  const text = `${opts.greeting}\n\n${opts.body}\n\n${opts.action}: ${opts.url}\n\n${opts.footer}\n\n— Buildwise`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#1d2124">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:18px;font-weight:bold;padding-bottom:16px">Buildwise</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:8px">${esc(opts.greeting)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">${esc(opts.body)}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${esc(opts.url)}" style="display:inline-block;background:#2fb5a4;color:#04201c;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(opts.action)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#5a6166">${esc(opts.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
}
