# Asset Manager

A full-stack, production-grade asset management platform built with Node.js, React, and PostgreSQL.

## Quick Start

See [docs/local-setup.md](docs/local-setup.md) for the full setup guide. The short version:

1. Install prerequisites: Node.js 20, PostgreSQL 16, Redis, Mailpit (see setup guide)
2. `npm install`
3. `cp .env.example .env` — fill in your values
4. Start services: `brew services start postgresql@16 && brew services start redis && mailpit &`
5. `make migrate && make db:seed`
6. `make dev`

## Stack

| Layer | Technology |
|---|---|
| API | Node.js 20, Express 5, TypeScript |
| Web | React 18, Vite, Tailwind CSS |
| Database | PostgreSQL 16, Prisma ORM |
| Cache / Queue | Redis 8, BullMQ |
| Auth | JWT + refresh token rotation, Argon2id, TOTP MFA |

## Project Structure

```
apps/
  api/        REST API (Express 5 + TypeScript)
  web/        Frontend (React 18 + Vite)
  worker/     Background jobs (BullMQ)
packages/
  db/         Prisma schema + migrations + seed
  types/      Shared TypeScript types + Zod schemas
  config/     Shared ESLint config
infra/
  nginx/      Reverse proxy config
  pm2/        Process manager config (remote envs)
dev/
  stop.sh     Graceful shutdown script
.github/
  workflows/  CI/CD pipelines
```

## Common Commands

```bash
make dev          # Start all dev servers
make stop         # Stop all dev servers
make migrate      # Run database migrations
make db:seed      # Seed database
make test         # Run all tests
make lint         # Run ESLint
make type-check   # Run TypeScript type-check
make build        # Build all apps
```

## Iteration 1 Scope

See [docs/asset-manager.md](docs/asset-manager.md) for the full architecture, DB schema, and user story acceptance criteria.
