---
name: Pinned outbound requests
description: Security and Node 24 behavior for server-side requests to user-supplied source URLs.
---

External-source URL validation must be bound to the address used by the actual HTTP connection. A separate DNS lookup followed by a hostname-based fetch leaves a DNS-rebinding window.

**Why:** Sitemap and catalog importers fetch admin-supplied URLs. Public-address validation alone is insufficient if the HTTP client resolves the hostname again. Node 24 may also invoke a custom lookup callback with `all: true`, which requires returning an address array rather than a single address.

**How to apply:** For any new outbound importer request, validate every resolved address, reject private/reserved IPv4 and IPv6 ranges, pin the connection lookup to a validated address, and repeat the process for every redirect hop. Support both single-address and `all: true` lookup callback shapes.