import { describe, expect, it } from "vitest";
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
} from "./platform-secret-crypto";

describe("Platform secret encryption", () => {
  it("round-trips secret and empty public-client values", () => {
    const root = "test-root-secret-with-at-least-32-characters";
    const encrypted = encryptPlatformSecret("provider-secret", root);

    expect(encrypted).not.toContain("provider-secret");
    expect(decryptPlatformSecret(encrypted, root)).toBe("provider-secret");
    expect(decryptPlatformSecret(encryptPlatformSecret("", root), root)).toBe("");
  });

  it("rejects another deployment key and malformed values", () => {
    const encrypted = encryptPlatformSecret(
      "provider-secret",
      "first-root-secret-with-at-least-32-characters",
    );

    expect(() => decryptPlatformSecret(
      encrypted,
      "second-root-secret-with-at-least-32-characters",
    )).toThrow("cannot be decrypted");
    expect(() => decryptPlatformSecret("plaintext", "irrelevant-secret"))
      .toThrow("unsupported format");
  });
});
