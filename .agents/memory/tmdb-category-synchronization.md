---
name: TMDB category synchronization
description: Rules for assigning primary TMDB genres and safely backfilling category data.
---

Use the first valid TMDB genre as a post's single primary category. Reuse categories by a normalized slug and create the category only when it does not exist.

**Why:** The catalog currently models one category per post. Historic metadata and new imports must use identical parsing and slug rules or duplicate, split categories can appear in navigation.

**How to apply:** Keep the genre parser and slug normalization shared by runtime enrichment and any data migration. Treat recorded data migrations as immutable: ship a new corrective migration for already-applied behavior, and only remove empty legacy category duplicates after posts have been reassigned.