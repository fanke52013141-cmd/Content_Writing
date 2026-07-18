# Content Writing Agent Guide

## Source of truth

Implementation decisions are resolved in this order:

1. `docs/product/v1.1-baseline.md`
2. `docs/adr/`
3. Tests and executable contracts
4. Earlier V1.0 planning documents

If an earlier document mentions WeChat hot topics, AI image generation, image search,
public-account management, publishing, or publication records, those items are out of
scope for V1.

## Development discipline

- Implement one module at a time and run its unit, integration, and type checks before
  starting the next module.
- Preserve immutable history for prompts, generated candidates, and accepted article
  versions.
- AI output creates a candidate. It never becomes current until the user accepts it.
- External systems are accessed only through provider interfaces.
- Never commit credentials, production data, uploaded files, backups, or generated
  `.env.local` files.
- Keep the local deployment bound to `127.0.0.1` by default.

## Required checks

Run these before committing a completed module:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Docker-related changes additionally require `powershell -File scripts/doctor.ps1` and,
when Docker Desktop is installed, `docker compose config` plus a cold-start health test.
