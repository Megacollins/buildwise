import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import type { AuthTokenPurpose } from "@/generated/prisma/client";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export const TOKEN_TTL: Record<AuthTokenPurpose, number> = {
  EMAIL_VERIFICATION: 48 * 3600,
  PASSWORD_RESET: 30 * 60,
};

/** Issue a single-use token. Earlier unused tokens for the same purpose are revoked. */
export async function issueAuthToken(userId: string, purpose: AuthTokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    db.authToken.create({
      data: { userId, purpose, tokenHash: hash(token), expiresAt: new Date(Date.now() + TOKEN_TTL[purpose] * 1000) },
    }),
  ]);
  return token;
}

/** Atomically consume a token. Returns the user id, or null if invalid, used or expired. */
export async function consumeAuthToken(token: string, purpose: AuthTokenPurpose) {
  if (!token || token.length > 100) return null;
  const tokenHash = hash(token);
  const { count } = await db.authToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return null;
  const row = await db.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return row?.userId ?? null;
}
