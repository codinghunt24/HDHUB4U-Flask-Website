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
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

  assert.throws(() => decryptTmdbApiKey(tampered));
});

test("returns only a masked suffix for admin status", () => {
  const apiKey = "0123456789abcdef0123456789abcdef";

  assert.equal(maskTmdbApiKey(apiKey), "••••••••cdef");
  assert.equal(maskTmdbApiKey(apiKey).includes(apiKey), false);
});