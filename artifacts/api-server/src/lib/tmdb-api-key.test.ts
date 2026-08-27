import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptTmdbApiKey,
  encryptTmdbApiKey,
  maskTmdbApiKey,
} from "./tmdb-api-key";

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
    "0123456789abcdef0123456789abcdef",
  );
  const [version, iv, authTag, ciphertext] = encrypted.split(".");
  const tamperedCiphertext = Buffer.from(ciphertext, "base64url");
  tamperedCiphertext[0] ^= 1;
  const tampered = [
    version,
    iv,
    authTag,
    tamperedCiphertext.toString("base64url"),
  ].join(".");

  assert.throws(() => decryptTmdbApiKey(tampered));
});

test("returns only a masked suffix for admin status", () => {
  const apiKey = "0123456789abcdef0123456789abcdef";

  assert.equal(maskTmdbApiKey(apiKey), "••••••••cdef");
  assert.equal(maskTmdbApiKey(apiKey).includes(apiKey), false);
});