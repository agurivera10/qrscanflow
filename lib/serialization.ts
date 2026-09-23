import { randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomPublicToken(length = 8) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function buildSerializedUrl(origin: string, slug: string, token: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/r/${encodeURIComponent(slug)}?u=${encodeURIComponent(token)}`;
}

export function trackingMarker(token: string) {
  return `[SF:${token}]`;
}
