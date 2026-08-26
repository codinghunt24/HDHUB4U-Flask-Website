---
name: OpenAPI numeric schema compatibility
description: Compatibility rule for Orval Zod output in this workspace.
---

Use OpenAPI `type: number` instead of `type: integer`, and plain strings instead of `format: uri`, until the workspace Zod dependency is upgraded.

**Why:** The current Orval generator emits `zod.int()` and `zod.url()` for those declarations, but the workspace resolves Zod 3, where those helpers do not exist.

**How to apply:** When extending the shared OpenAPI contract, avoid declarations that generate Zod 4-only helpers or explicitly coordinate a workspace-wide Zod upgrade first.