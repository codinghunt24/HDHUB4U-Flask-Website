---
name: Previous-post ordering
description: Defines the public meaning and edge-case behavior of numbered previous-post navigation.
---

Previous-post navigation includes published posts only. “Previous” means older in public publish order: lower publication time first, with lower post ID as the tie-breaker for equal timestamps. Numbered positions that do not exist are hidden.

**Why:** This keeps the labels honest, deterministic, and aligned with the order visitors understand as publication history.

**How to apply:** Use this rule anywhere the site adds or changes previous/older post links, pagination, or adjacent-post navigation.