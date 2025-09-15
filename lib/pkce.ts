import crypto from "crypto";

export function base64url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function generateVerifier(length = 64) {
  return base64url(crypto.randomBytes(length));
}

export function challengeFromVerifier(verifier: string) {
  const hashed = crypto.createHash("sha256").update(verifier).digest();
  return base64url(hashed);
}
