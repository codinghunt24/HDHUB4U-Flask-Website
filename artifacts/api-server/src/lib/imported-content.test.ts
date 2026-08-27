import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImportedExcerpt,
  cleanImportedExcerpt,
  containsBlockedImportTerms,
  replaceVisitorTerms,
} from "./imported-content";

test("builds visitor-facing excerpts without importer instructions", () => {
  assert.equal(
    buildImportedExcerpt("Toxic (2026) V2 Hindi Multi Audio HQ-HDTC 1080p"),
    "Explore Toxic (2026) V2 Hindi Multi Audio HQ-HDTC 1080p and view its release details and authorized source information.",
  );
});

test("cleans stored importer boilerplate", () => {
  assert.equal(
    cleanImportedExcerpt(
      "Imported listing from new5.hdhub4u.cl. Review and edit before republishing.",
      "Toxic (2026)",
    ),
    "Explore Toxic (2026) and view its release details and authorized source information.",
  );
  assert.equal(
    cleanImportedExcerpt(
      "Imported listing from new5.hdhub4u.cl. Review and edit before republishing.\n",
      "Toxic (2026)",
    ),
    "Explore Toxic (2026) and view its release details and authorized source information.",
  );
});

test("preserves meaningful editorial excerpts", () => {
  const excerpt = "A curated release overview written by the editorial team.";
  assert.equal(cleanImportedExcerpt(excerpt, "Toxic (2026)"), excerpt);
});

test("replaces visitor-facing watch and download terms", () => {
  assert.equal(
    replaceVisitorTerms("Watch this release or DOWNLOAD it later."),
    "See this release or Get it later.",
  );
  assert.equal(
    cleanImportedExcerpt("Watch or download this release.", "Example"),
    "See or Get this release.",
  );
});

test("blocks adult import terms without matching unrelated words", () => {
  assert.equal(containsBlockedImportTerms("Example porn release"), true);
  assert.equal(containsBlockedImportTerms("Sex Education season 1"), true);
  assert.equal(
    containsBlockedImportTerms("https://example.com/%73%65%78/movie"),
    true,
  );
  assert.equal(containsBlockedImportTerms("Essex County"), false);
});