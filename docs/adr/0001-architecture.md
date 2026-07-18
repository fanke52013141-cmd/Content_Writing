# ADR-0001: Modular monolith with replaceable providers

Status: Accepted

## Decision

Use a pnpm/Turborepo monorepo with a Next.js web application, a NestJS/Fastify modular
API, a separate worker process, PostgreSQL as the source of truth and Redis/BullMQ for
rebuildable queues and locks.

All model, hot-topic, search, extraction, formatting and storage integrations are
accessed through provider interfaces. Provider-specific response fields must not leak
into domain modules.

## Consequences

- Core object updates and outbox events can share PostgreSQL transactions.
- Worker failure cannot remove accepted content or version history.
- Third-party services can be disabled or replaced without data migration.
- Docker Compose remains the V1 deployment unit; native packaging is deferred.
