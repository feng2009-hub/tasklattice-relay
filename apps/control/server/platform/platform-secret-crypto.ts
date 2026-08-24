import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const cipherVersion = "v1";
const algorithm = "aes-256-gcm";

function encryptionKey(rootSecret: string): Buffer {
  return createHash("sha256")
    .update("tasklattice:platform-settings:v1\0", "utf8")
    .update(rootSecret, "utf8")
    .digest();
}

export function encryptPlatformSecret(value: string, rootSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(rootSecret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    cipherVersion,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptPlatformSecret(value: string, rootSecret: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...rest] = value.split(":");
  if (
    version !== cipherVersion
    || !encodedIv
    || !encodedTag
    || encodedCiphertext === undefined
    || rest.length > 0
  ) {
    throw new Error("The stored Platform secret has an unsupported format.");
  }
  try {
    const decipher = createDecipheriv(
      algorithm,
      encryptionKey(rootSecret),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "The stored Platform secret cannot be decrypted with the active deployment key.",
    );
  }
}
