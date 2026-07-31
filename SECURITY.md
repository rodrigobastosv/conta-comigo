# Security policy

## Reporting a vulnerability

**Do not open a public issue** for a security flaw. Use one of these channels:

- [Private security advisory](https://github.com/rodrigobastosv/conta-comigo/security/advisories/new) (preferred)
- Email: rodrigobastosv@gmail.com

Include whatever you can: steps to reproduce, version/commit, and the impact you
see. Response within 7 days.

## What is especially sensitive here

This project generates content for children and talks to a language model. On top
of the usual web flaws, we treat these as vulnerabilities:

- **Leaking the `ANTHROPIC_API_KEY`.** The key is only read in server code
  ([lib/anthropic.ts](lib/anthropic.ts)). Any path that exposes it to the browser
  — a `NEXT_PUBLIC_*` variable, a log, an error message returned to the client —
  is a flaw, not a style issue.
- **Bypassing the generation ceiling.** The limit lives on the server, in
  [lib/scene-route.ts](lib/scene-route.ts), and is counted by
  `claim_generation()` under a key the caller does not choose. Any way of blowing
  up API cost by getting around that ceiling counts as a vulnerability — as does
  reaching `POST /api/scene` without a session on a deployment that has an
  archive, which would make it a free model endpoint.
- **Prompt injection that breaks the narrator's limits.** If a client-controlled
  field (`helperName`, `choiceMade`, `facts`) makes the model violate the
  constitution's LIMITES INVIOLÁVEIS — see
  [docs/story-bible.md](docs/story-bible.md) — it is a product security flaw.
  Describe the exact payload.
- **An RLS hole.** The policies in [supabase/schema.sql](supabase/schema.sql) exist
  so that no child's data crosses from one guardian to another. Any query that
  gets through that is critical.

## Out of scope

Automated scanner reports with no proof of exploitation, and missing rate limits
on a route that does not cost money.
