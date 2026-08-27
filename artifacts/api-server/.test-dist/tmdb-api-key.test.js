// src/lib/tmdb-api-key.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/lib/tmdb-api-key.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
var ENCRYPTION_ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 12;
var ENCRYPTION_VERSION = "v1";
var getEncryptionKey = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required to encrypt the TMDB API key");
  }
  return createHash("sha256").update(secret ?? "hdhub4u-development-secret-do-not-use-in-production").digest();
};
var encryptTmdbApiKey = (apiKey) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
};
var decryptTmdbApiKey = (encryptedApiKey) => {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext] = encryptedApiKey.split(".");
  if (version !== ENCRYPTION_VERSION || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new Error("Invalid encrypted TMDB API key");
  }
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
};
var maskTmdbApiKey = (apiKey) => `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${apiKey.slice(-4)}`;

// src/lib/tmdb-api-key.test.ts
test("encrypts and decrypts a TMDB API key without storing plaintext", () => {
  const apiKey = "0123456789abcdef0123456789abcdef";
  const encrypted = encryptTmdbApiKey(apiKey);
  assert.notEqual(encrypted, apiKey);
  assert.equal(encrypted.includes(apiKey), false);
  assert.equal(decryptTmdbApiKey(encrypted), apiKey);
});
test("uses a fresh nonce for each encrypted TMDB API key", () => {
  const apiKey = "0123456789abcdef0123456789abcdef";
  assert.notEqual(encryptTmdbApiKey(apiKey), encryptTmdbApiKey(apiKey));
});
test("rejects tampered encrypted TMDB API keys", () => {
  const encrypted = encryptTmdbApiKey(
    "0123456789abcdef0123456789abcdef"
  );
  const [version, iv, authTag, ciphertext] = encrypted.split(".");
  const tamperedCiphertext = Buffer.from(ciphertext, "base64url");
  tamperedCiphertext[0] ^= 1;
  const tampered = [
    version,
    iv,
    authTag,
    tamperedCiphertext.toString("base64url")
  ].join(".");
  assert.throws(() => decryptTmdbApiKey(tampered));
});
test("returns only a masked suffix for admin status", () => {
  const apiKey = "0123456789abcdef0123456789abcdef";
  assert.equal(maskTmdbApiKey(apiKey), "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022cdef");
  assert.equal(maskTmdbApiKey(apiKey).includes(apiKey), false);
});
