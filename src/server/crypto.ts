import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for Google tokens at rest. Output: "v1.<iv>.<tag>.<ciphertext>",
// all base64url, so the format can change later without guessing.

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decrypt(sealed: string, key: Buffer): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Session tokens are stored hashed so a leaked database cannot be replayed as cookies. */
export const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");
