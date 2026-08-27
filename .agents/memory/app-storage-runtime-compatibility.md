---
name: App Storage runtime compatibility
description: Keeps App Storage dependencies compatible with the project runtime.
---

Use the Node-20-compatible `@google-cloud/storage` v7 line for the app’s App Storage client unless the project runtime is intentionally upgraded.

**Why:** The project’s configured runtime is Node 20, while the v8 storage client requires a newer Node release and can break real media ingestion despite passing mocked tests.

**How to apply:** Before upgrading the storage client, check its declared Node engine against the runtime configured for this project and verify that the API workflow can import it.