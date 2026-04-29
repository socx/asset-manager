# Asset Manager — Local Development Setup Guide

> **Purpose:** Step-by-step instructions to get the full Asset Manager stack running on your local machine.  
> **Target audience:** Any developer starting from scratch.  
> **Last updated:** April 2026

---

## Prerequisites

Install the following tools before you begin. Exact minimum versions are listed where they matter.

| Tool | Minimum version | How to install |
|---|---|---|
| **Git** | 2.40+ | `brew install git` (macOS) / [git-scm.com](https://git-scm.com) |
| **Node.js** | 20 LTS | Via [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use 20` |
| **npm** | 10+ | Bundled with Node 20 |
| **PostgreSQL** | 16 | `brew install postgresql@16` |
| **Redis** | 7+ (8 is fine) | `brew install redis` |
| **Mailpit** *(local email trap)* | Latest | `brew install mailpit` |
| **Make** | Any | Pre-installed on macOS/Linux; Windows: `winget install GnuWin32.Make` |
| **mkcert** *(optional — HTTPS local dev)* | Latest | `brew install mkcert` then `mkcert -install` |

### Verify your environment

```bash
node -v        # v20.x.x
npm -v         # 10.x.x
psql --version # psql (PostgreSQL) 16.x
redis-cli --version  # Redis CLI 7.x or 8.x — both are fine
git --version  # git version 2.40+
```

---

## Step 1 — Clone the repository

```bash
git clone https://github.com/socx/asset-manager.git
cd asset-manager
```

---

## Step 2 — Install dependencies

The project uses **npm workspaces** (monorepo). A single install at the root installs all packages across `apps/` and `packages/`.

```bash
npm install
```

This installs dependencies for:
- `apps/api` — Node.js + Express 5 REST API (TypeScript)
- `apps/web` — React 18 + Vite frontend (TypeScript)
- `apps/worker` — BullMQ background job workers
- `packages/db` — Prisma schema & migrations
- `packages/types` — Shared TypeScript / Zod schemas
- `packages/config` — Shared ESLint, TypeScript, env config

---

## Step 3 — Configure environment variables

Copy the example env file and fill in your local values:

```bash
cp .env.example .env
```

Open `.env` in your editor and set the following values:

```dotenv
# ── Application ──────────────────────────────────────────
NODE_ENV=development
APP_BASE_URL=http://localhost:5173
API_PORT=3000
SSL_PORT=3443

# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://asset_user:asset_pass@localhost:5432/asset_manager_dev
DATABASE_REPLICA_URL=   # leave blank in local dev

# ── Redis ────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── JWT ──────────────────────────────────────────────────
JWT_ACCESS_SECRET=change_me_to_a_64_char_random_string
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ── Email (local Mailpit — no real credentials needed) ───
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@assetmanager.local

# ── Seed ─────────────────────────────────────────────────
SEED_SUPER_ADMIN_EMAIL=admin@assetmanager.local
SEED_SUPER_ADMIN_PASSWORD=SuperAdmin@123!

# ── Feature flags ────────────────────────────────────────
SELF_REGISTRATION_ENABLED=true
```

> **Security note:** Never commit `.env` to Git — it is listed in `.gitignore`.  
> To generate a strong JWT secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Step 4 — Start the backing services

Start **PostgreSQL 16**, **Redis 7**, and **MailHog** (local email trap) as native background services.

### PostgreSQL 16

```bash
# Add the postgresql@16 bin directory to your PATH (add to ~/.zshrc or ~/.zprofile permanently)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# Start PostgreSQL as a background service
brew services start postgresql@16

# Create the database user and database
psql postgres -c "CREATE USER asset_user WITH PASSWORD 'asset_pass';"
psql postgres -c "CREATE DATABASE asset_manager_dev OWNER asset_user;"
```

> If you use an Intel Mac, Homebrew installs to `/usr/local` rather than `/opt/homebrew`. Adjust the PATH export accordingly.

### Redis

Homebrew currently installs Redis 8, which is fully backward-compatible with Redis 7. All project dependencies (BullMQ, session store, rate limiting) work without any changes.

> **Remote server note:** When provisioning a Digital Ocean droplet or similar, install Redis from the [official Redis apt repository](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-linux/) to get the same major version. Alternatively, use a managed Redis service (e.g. Upstash, Digital Ocean Managed Redis) where the version is handled for you.

```bash
# Start Redis as a background service
brew services start redis

# Verify Redis is responding
redis-cli ping
# Expected: PONG
```

### Mailpit *(local email trap — replaces MailHog)*

[Mailpit](https://mailpit.axllent.org) is the actively maintained successor to MailHog. It uses the same ports, so no environment variable changes are needed.

```bash
# Start Mailpit as a background service
brew services start mailpit
```

Or run it in the foreground in a dedicated terminal tab:

```bash
mailpit
```

**Service ports at a glance:**

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL | `5432` | Primary database |
| Redis | `6379` | Sessions, caching, job queue |
| Mailpit | `1025` (SMTP) / `8025` (UI) | Local email trap |

### Verify all services are running

```bash
# PostgreSQL
pg_isready -h localhost -p 5432
# Expected: localhost:5432 - accepting connections

# Redis
redis-cli ping
# Expected: PONG

# Mailpit UI
open http://localhost:8025
```

---

## Step 5 — Run database migrations and seed data

```bash
# Apply all Prisma migrations to the local database
make migrate
# or: npm run db:migrate

# Seed roles and a default Super Admin user
make db:seed
# or: npm run db:seed
```

After seeding you will have a `super_admin` account ready to log in with the credentials set in `.env` (`SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`).

---

## Step 6 — Start the development servers

```bash
make dev
# or: npm run dev
```

This uses `concurrently` to start all three services simultaneously with hot-reload enabled:

| Service | URL | Hot-reload |
|---|---|---|
| **API** | `http://localhost:3000` | nodemon (TypeScript re-compiles on save) |
| **Web** | `http://localhost:5173` | Vite HMR |
| **Worker** | *(no HTTP port)* | nodemon |

### Verify everything is working

```bash
# API health check
curl http://localhost:3000/health
# Expected: { "status": "ok", "timestamp": "...", "version": "1.0.0" }

# API docs (Swagger UI)
open http://localhost:3000/api/docs

# Web app
open http://localhost:5173

# Mailpit email UI (inspect outbound emails in dev)
open http://localhost:8025
```

---

## Step 7 — (Optional) HTTPS local development

Some browser APIs require HTTPS. To run the API over TLS locally:

```bash
# Install a locally-trusted CA (one-time, requires mkcert)
mkcert -install

# Generate certs and start API on HTTPS
npm run dev:secure
```

The API will be available at `https://localhost:3443`. The self-signed cert will be trusted by your browser.

---

## Common `make` targets

| Command | Description |
|---|---|
| `make dev` | Start all dev servers (API + Web + Worker) |
| `make stop` | Gracefully stop all dev processes |
| `make migrate` | Run Prisma migrations against local DB |
| `make db:seed` | Seed the database with roles and default Super Admin |
| `make build` | Build all apps for production |
| `make test` | Run all unit tests |
| `make lint` | Run ESLint across all packages |
| `make type-check` | Run `tsc --noEmit` across all packages |

---

## Useful URLs at a glance

| Service | URL |
|---|---|
| Web App | http://localhost:5173 |
| API | http://localhost:3000 |
| API Health | http://localhost:3000/health |
| API Swagger Docs | http://localhost:3000/api/docs |
| Mailpit (email UI) | http://localhost:8025 |

---

## Project structure overview

```
asset-manager/
  apps/
    api/          Node.js + Express 5 REST API (TypeScript)
    web/          React 18 + Vite frontend (TypeScript)
    worker/       BullMQ job workers (email, notifications)
  packages/
    db/           Prisma schema + migrations (shared)
    types/        Shared TypeScript types and Zod schemas
    config/       Shared ESLint + TypeScript + env config
  infra/
    nginx/        Nginx reverse proxy config
    pm2/          PM2 process config (remote envs)
    docker/       Production Dockerfiles
  dev/
    stop.sh               Graceful process shutdown script
  .github/
    workflows/
      ci.yml              Test + lint on every push and PR
      deploy-dev.yml      Auto-deploy to remote dev on merge to main
      security.yml        Weekly dependency & image security scan
  Makefile        Top-level make targets
  .env.example    Documented environment variable template
```

---

## Stopping and cleaning up

```bash
# Stop all dev servers
make stop

# Stop background services
brew services stop postgresql@16
brew services stop redis
# Stop Mailpit if running as a background service
brew services stop mailpit

# Drop and recreate the local database (destructive!)
dropdb asset_manager_dev && createdb -O asset_user asset_manager_dev

# Reset the database schema from scratch and re-seed
npm run db:migrate:reset && npm run db:seed
```

---

## Troubleshooting

### Port already in use

If a port is occupied by another process:

```bash
# Find the process using a port (e.g. 3000)
lsof -ti :3000 | xargs kill -9
```

### Database connection refused

Check that PostgreSQL is running and accepting connections:

```bash
brew services list | grep postgresql
pg_isready -h localhost -p 5432

# Start PostgreSQL if it is stopped
brew services start postgresql@16

# Check PostgreSQL logs
tail -f /opt/homebrew/var/log/postgresql@16.log
# Intel Mac: /usr/local/var/log/postgresql@16.log
```

### Prisma migration errors

If migrations fail due to a dirty state (e.g. mid-migration crash), reset and reapply:

```bash
npm run db:migrate:reset
```

### `node_modules` out of sync after switching branches

```bash
npm install
```

### Environment variable not picked up

Restart the dev servers after changing `.env`. The API does not hot-reload env vars.

---

## Next steps after local setup

1. Log in to the Web App at `http://localhost:5173` using the seeded Super Admin credentials.
2. Open Swagger UI at `http://localhost:3000/api/docs` to explore the API.
3. Check the GitHub project board for the current sprint backlog and pick up a task.
4. Read `docs/asset-manager.md` for the full architecture decisions, DB schema, and acceptance criteria.

---

*Document version 1.0 — April 2026 | Asset Manager Project*
