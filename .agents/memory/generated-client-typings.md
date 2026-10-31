---
name: Generated client typings
description: Keep generated React Query hooks and Fetch API types aligned with installed dependencies.
---

When regenerating the API client, keep Orval's React Query major version aligned with the installed `@tanstack/react-query` version, and include `DOM.Iterable` in the client TypeScript libraries when generated code iterates Fetch `Headers`.

**Why:** Generated hooks can silently target an older query API, and generated Fetch code may use iterable `Headers` methods that the TypeScript lib configuration does not expose.

**How to apply:** If codegen warns about the detected query version or typechecking fails on `Headers.entries()`, check the package's declared major version and DOM libraries before changing generated code.
