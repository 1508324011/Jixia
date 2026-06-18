import { createHash, randomBytes } from "node:crypto";

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashInvitationToken(invitationToken: string): string {
  return createHash("sha256").update(invitationToken, "utf8").digest("base64url");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
