# Asset Manager — Iteration 1 Epic
**Project:** Asset Manager  
**Iteration:** 1  
**Goal:** Fully functional User Management System, Audit Logs, System Logging, Local/Remote Dev Environment & CI/CD Pipeline  
**Date:** April 2026  

---

## Table of Contents
1. [Technology Stack Recommendations](#technology-stack)
2. [Authentication Strategy Recommendation](#authentication-strategy)
3. [Scalability Planning](#scalability-planning)
4. [Patterns Borrowed from RMS](#patterns-from-rms)
5. [Project Structure](#project-structure)
6. [Epic: ITER-1 — Foundation & User Management](#epic)
7. [User Stories](#user-stories)

---

## 1. Technology Stack Recommendations {#technology-stack}

### Frontend (Web)
| Concern | Recommendation | Rationale |
|---|---|---|
| Framework | **React 18 + TypeScript** | Proven at scale, large ecosystem, future React Native path for mobile |
| Build tool | **Vite** | Fast HMR, consistent with RMS pattern |
| State / Server State | **TanStack Query v5** | Consistent with RMS; caching, background refetch, pagination built-in |
| Global State | **Zustand** | Lightweight, no boilerplate |
| Routing | **React Router v6** | Industry standard |
| UI Component Library | **shadcn/ui + Tailwind CSS** | Unstyled primitives give full design control; Tailwind scales well |
| Forms | **React Hook Form + Zod** | Type-safe validation, minimal re-renders |
| Tables | **TanStack Table v8** | Essential for portfolio/asset views at 100K row scale |

### Backend (API)
| Concern | Recommendation | Rationale |
|---|---|---|
| Runtime | **Node.js 20 LTS** | Consistent with RMS; mature, large ecosystem |
| Framework | **Express 5 or Fastify 4** | Express consistent with RMS; Fastify if throughput is priority |
| Language | **TypeScript** | Type safety across codebase |
| ORM | **Prisma** | Consistent with RMS; excellent migrations, type-safe queries |
| Database | **PostgreSQL 16** | Consistent with RMS; JSONB for flexible asset metadata, row-level security |
| Caching | **Redis 7** | Session store, rate limiting, background job queues |
| Background Jobs | **BullMQ (Redis-backed)** | Email verification queues, notification jobs |
| Email | **Resend or SendGrid** | Transactional email; pluggable adapter pattern from RMS |
| Validation | **Zod** | Shared schemas between API and frontend |

### Authentication Layer
| Concern | Recommendation |
|---|---|
| Auth Framework | **Auth.js (NextAuth v5) or custom JWT + refresh token rotation** |
| MFA | **TOTP (speakeasy) + WebAuthn** |
| Social Login | **Google OAuth 2.0 (Iteration 2+)** |
| Password Hashing | **Argon2id** |
| Session Store | **Redis** |

### Infrastructure & DevOps
| Concern | Recommendation | Rationale |
|---|---|---|
| Containerisation | **Docker + Docker Compose** | Consistent with RMS `dev/` pattern |
| Remote Hosting | **Railway / Render (dev) → AWS ECS Fargate (prod)** | Low ops overhead at start, scales to enterprise |
| Database Hosting | **Supabase (dev) → AWS RDS PostgreSQL (prod)** | Supabase free tier great for dev; RDS for production scale |
| Redis Hosting | **Upstash (dev) → AWS ElastiCache (prod)** | Same rationale |
| CI/CD | **GitHub Actions** | Consistent with RMS `.github/workflows/` |
| Secret Management | **GitHub Secrets + AWS Secrets Manager (prod)** | |
| Reverse Proxy | **Nginx** | Consistent with RMS `infra/nginx/` |
| Process Manager | **PM2** | Consistent with RMS `infra/pm2/` |
| Logging | **Winston + structlog → Grafana Loki (prod)** | Structured JSON logs queryable at scale |
| Monitoring | **Sentry (errors) + Grafana (metrics)** | |

### Monorepo Structure (borrow from RMS)
```
asset-manager/
  apps/
    api/          Node.js + Express/Fastify REST API (TypeScript)
    web/          React + Vite frontend (TypeScript)
    worker/       BullMQ job workers (email, notifications)
  packages/
    db/           Prisma schema (shared)
    types/        Shared TypeScript types/Zod schemas
    config/       Shared config (env validation)
  infra/
    nginx/        Nginx config
    pm2/          PM2 process config
    docker/       Dockerfiles
  .github/
    workflows/    GitHub Actions CI/CD
  dev/            Local dev scripts (consistent with RMS pattern)
  Makefile        Top-level dev commands
```

---

## 2. Authentication Strategy Recommendation {#authentication-strategy}

### Verdict: Layered Hybrid Approach

For an asset management platform, security and UX must both be excellent. The recommendation is a **phased layered strategy**:

#### Phase 1 (Iteration 1 — Ship Now)
- **Email + Password with JWT + Refresh Token Rotation**
  - Access token: short-lived (15 min), stored in memory
  - Refresh token: 7-day rolling, stored in HttpOnly Secure cookie
  - Argon2id password hashing (superior to bcrypt for GPU attack resistance)
  - Rate limiting on auth endpoints (Redis-backed)
  - Account lockout after N failed attempts
  - TOTP-based **MFA** as opt-in (required for Admin and Super Admin roles)

#### Phase 2 (Iteration 2 — Add Social)
- **Google OAuth 2.0** (most demanded by asset management professionals)
- LinkedIn OAuth (common in wealth management space)
- SSO via SAML 2.0 or OIDC for enterprise clients

#### Phase 3 (Iteration 3+)
- **Passwordless (Magic Link)** as alternative login method
- **WebAuthn / Passkeys** for highest-security users
- SMS OTP as MFA fallback

### Why NOT alternatives alone:
| Method | Issue |
|---|---|
| Token-only (no password) | Magic links require email access on every login — poor UX for frequent users |
| Social-only | Enterprise/institutional clients cannot use personal Google accounts |
| Passwordless-only | Recovery flows complex; regulators often require explicit credential management |
| MFA-only | MFA is a layer, not a primary auth method |

### Security Additions to Plan In From Day 1
- PKCE flow for all OAuth
- CSRF protection (SameSite=Strict cookies + CSRF token for state-mutating requests)
- Helmet.js middleware
- `device_fingerprint` column on sessions table (detect session hijacking)
- Suspicious login detection (new IP/device → notify user)
- `failed_login_attempts` + `locked_until` on users table

---

## 3. Scalability Planning (100K users / 10K portfolios / 100K assets each) {#scalability-planning}

### Database Design
- **UUIDs v7** (time-sortable) as primary keys — avoids index fragmentation, better than v4
- **Row-Level Security (RLS)** in PostgreSQL — enforces multi-tenancy at DB level
- **Partitioning**: `audit_logs` and `system_logs` tables partitioned by date (monthly)
- **Indexes**: Cover all FK columns, `user_id`, `portfolio_id`, `asset_id`, `created_at`; partial indexes for soft-deleted records
- **Connection Pooling**: PgBouncer in transaction mode (supports 100K users on modest DB instances)
- **Read Replicas**: Plan the `DATABASE_REPLICA_URL` env var from day 1, even if unused in iteration 1

### API Design
- All list endpoints **paginated by default** (cursor-based, not offset, for large datasets)
- API versioned from day 1: `/api/v1/...`
- Rate limiting per user per endpoint (Redis sliding window)
- Request IDs on every request (traceable through logs)

### Caching Strategy
- User sessions in Redis
- Permission/role lookups cached per user (invalidate on role change)
- Cache-aside for frequently read, rarely changed data

### Infrastructure
- Stateless API from day 1 (enables horizontal scaling)
- File uploads to S3/object storage (never local disk)
- Background work always in queues (BullMQ), never inline

---

## 4. Patterns Borrowed from RMS Repo {#patterns-from-rms}

| Pattern | How it applies to Asset Manager |
|---|---|
| Monorepo with `apps/`, `packages/`, `infra/` | Adopt identical structure |
| `Makefile` top-level commands | `make dev`, `make stop`, `make migrate`, `make test` |
| `dev/stop.sh` graceful shutdown | Adopt for killing all dev processes cleanly |
| Docker Compose for local dev | Port to Asset Manager with additional Redis service |
| Prisma shared in `packages/db/` | Same pattern — schema and migrations centralised |
| `.github/workflows/ci.yml` | Extend: add lint, type-check, E2E steps |
| GitHub Actions + PostgreSQL service | Reuse pattern for test database in CI |
| Express 5 + `/api/v1/` routing structure | Direct adoption |
| SMTP/SendGrid adapter pattern | Extend for email verification & notifications |
| `npm run dev` starting all services via `concurrently` | Adopt |
| `SSL_PORT` env var + self-signed cert for `dev:secure` | Adopt for HTTPS local dev |
| `PATCH /admin/settings/:key` pattern | Extend for system settings (self-registration toggle, etc.) |
| Per-worker port assignment in tests | Adopt to avoid test flakes |

---

## 5. Project Structure Detail {#project-structure}

### Database Schema (Iteration 1 tables)
```
users
  id (UUID v7), email, password_hash, first_name, last_name,
  role (enum: super_admin, system_admin, asset_owner, asset_manager),
  status (enum: pending_verification, active, disabled),
  email_verified_at, mfa_enabled, mfa_secret,
  failed_login_attempts, locked_until,
  created_at, updated_at, deleted_at (soft delete)

user_sessions
  id, user_id, refresh_token_hash, device_fingerprint,
  ip_address, user_agent, expires_at, revoked_at, created_at

email_verifications
  id, user_id, token_hash, expires_at, used_at, created_at

password_reset_tokens
  id, user_id, token_hash, expires_at, used_at, created_at

audit_logs  [partitioned by month]
  id (bigserial), actor_id, actor_role, action, entity_type,
  entity_id, old_value (JSONB), new_value (JSONB),
  ip_address, user_agent, created_at

system_logs  [partitioned by month]
  id (bigserial), level (enum: debug, info, warn, error, fatal),
  service, message, context (JSONB), trace_id, created_at

system_settings
  key (unique), value, description, updated_by, updated_at
```

---

## 6. Epic: ITER-1 — Foundation & User Management {#epic}

**Epic ID:** ITER-1  
**Epic Title:** Foundation, User Management, Audit & System Logging  
**Goal:** Deliver a production-grade, scalable foundation with complete user lifecycle management, robust audit trail, system observability, and fully automated CI/CD pipelines.  
**Definition of Done:** All user stories below checked off with acceptance criteria met, CI green, deployed to remote dev environment.

---

## 7. User Stories {#user-stories}

---

### ITER-1-001 · Project Scaffold & Monorepo Setup

**As a** developer  
**I want** a clean, structured monorepo with all tooling configured  
**So that** the team can develop consistently from day one

**Acceptance Criteria:**
- [ ] Monorepo created with `apps/api`, `apps/web`, `apps/worker`, `packages/db`, `packages/types`, `packages/config`, `infra/`, `dev/`, `.github/workflows/`
- [ ] TypeScript configured in all `apps/` and `packages/` with shared `tsconfig.json` base
- [ ] ESLint + Prettier configured with shared config in `packages/config`
- [ ] `package.json` workspace setup at root with `npm workspaces`
- [ ] `Makefile` with targets: `dev`, `stop`, `build`, `test`, `lint`, `migrate`, `db:seed`
- [ ] `dev/stop.sh` script gracefully kills all dev processes
- [ ] `.env.example` at root with all required variables documented
- [ ] `README.md` with quickstart instructions (≤5 steps to running locally)
- [ ] `.gitignore` covers all generated artifacts, `.env` files, `node_modules`, `dist/`

**Notes:** Mirror RMS repo structure. Use `npm workspaces` (not Turborepo) for simplicity in iteration 1.

---

### ITER-1-002 · Local Development Environment

**As a** developer  
**I want** a fully containerised local development environment  
**So that** any team member can run the full stack with a single command

**Acceptance Criteria:**
- [ ] `docker-compose.yml` in `dev/` spins up: PostgreSQL 16, Redis 7, pgAdmin (optional), MailHog (local email trap)
- [ ] `npm run dev` starts API, web, and worker concurrently via `concurrently`
- [ ] `npm run dev:secure` generates self-signed TLS certs and starts API on HTTPS
- [ ] Hot-reload works for both API (nodemon) and web (Vite HMR)
- [ ] `npm run db:migrate` applies Prisma migrations against local DB
- [ ] `npm run db:seed` seeds roles and a default Super Admin user
- [ ] All services connect correctly via env vars in `.env.dev`
- [ ] MailHog web UI accessible at `http://localhost:8025` for inspecting outbound emails in dev
- [ ] Health check endpoint `GET /health` returns `{ status: "ok", timestamp, version }`

**Notes:** MailHog replaces SendGrid in local dev — mirror the SMTP adapter pattern from RMS.

---

### ITER-1-003 · Remote Development Environment Setup

**As a** developer  
**I want** a remote development environment provisioned and accessible  
**So that** integration testing happens against a real cloud environment before production

**Acceptance Criteria:**
- [ ] Remote dev environment provisioned (Railway or Render recommended for iteration 1)
- [ ] PostgreSQL instance provisioned remotely, credentials stored in GitHub Secrets
- [ ] Redis instance provisioned remotely (Upstash free tier acceptable)
- [ ] API deployed and accessible via a stable URL (e.g. `https://api-dev.assetmanager.app`)
- [ ] Web app deployed and accessible (e.g. `https://app-dev.assetmanager.app`)
- [ ] All environment variables documented in `infra/env.remote-dev.example`
- [ ] SSL/TLS enforced on all remote endpoints (HTTPS only)
- [ ] Nginx reverse proxy configured for remote dev (port 80 → 443 redirect, `/api` proxy to API)
- [ ] PM2 config (`infra/pm2/ecosystem.config.js`) manages API process on remote

---

### ITER-1-004 · Database Schema & Migrations (Iteration 1)

**As a** developer  
**I want** all Iteration 1 tables created via Prisma migrations  
**So that** schema changes are version-controlled and reproducible

**Acceptance Criteria:**
- [ ] Prisma schema defined in `packages/db/schema.prisma`
- [ ] Tables created: `users`, `user_sessions`, `email_verifications`, `password_reset_tokens`, `audit_logs`, `system_logs`, `system_settings`
- [ ] All primary keys use UUID v7 (use `@default(dbgenerated("gen_random_uuid()"))` or custom UUID v7 function)
- [ ] `audit_logs` and `system_logs` tables partitioned by month (via raw SQL migration)
- [ ] All foreign keys indexed
- [ ] Soft-delete pattern: `deleted_at` nullable timestamp on `users`
- [ ] Initial migration file committed to `packages/db/migrations/`
- [ ] `db:migrate` and `db:seed` scripts work in both local and CI environments
- [ ] Migration rollback tested (Prisma `migrate reset` restores from scratch successfully)

---

### ITER-1-005 · User Registration

**As a** new user  
**I want** to register for an account  
**So that** I can access the Asset Manager platform

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/register` endpoint accepts: `email`, `password`, `firstName`, `lastName`
- [ ] Password validated: min 12 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
- [ ] Email validated for format and checked for duplicate (case-insensitive)
- [ ] Password hashed with **Argon2id** before storage
- [ ] On success: user created with `status: pending_verification`, verification email queued
- [ ] Registration returns `201` with `{ message: "Verification email sent" }` — no token issued yet
- [ ] System setting `SELF_REGISTRATION_ENABLED` (boolean, default `true`) gates this endpoint
- [ ] When `SELF_REGISTRATION_ENABLED=false`, endpoint returns `403` with message "Self-registration is disabled. Contact an administrator."
- [ ] Registration form on web app validates all fields client-side with matching Zod schema
- [ ] Audit log entry created: `action: USER_REGISTERED`, `entity_type: user`, `entity_id: <userId>`
- [ ] Rate limiting: max 5 registration attempts per IP per hour

---

### ITER-1-006 · Email Verification

**As a** newly registered user  
**I want** to verify my email address  
**So that** my account is activated

**Acceptance Criteria:**
- [ ] On registration, a verification email is sent containing a signed token link (e.g. `https://app.../verify-email?token=<token>`)
- [ ] Token is a cryptographically random 32-byte value, stored as a hash (SHA-256) in `email_verifications` table
- [ ] Token expires after 24 hours
- [ ] `GET /api/v1/auth/verify-email?token=<token>` validates the token, marks user as `active`, sets `email_verified_at`
- [ ] On success: redirect (or JSON `200`) and clear verification record
- [ ] Expired or invalid token returns `400` with clear error message
- [ ] Already-verified user visiting a used link receives friendly message (not an error)
- [ ] Email template is styled, branded "Asset Manager", links are correct in both dev (localhost) and remote envs via `APP_BASE_URL` env var
- [ ] Audit log entry: `action: EMAIL_VERIFIED`

---

### ITER-1-007 · Resend Email Verification

**As a** user who hasn't verified their email  
**I want** to request a new verification email  
**So that** I can complete registration if the original email expired or was lost

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/resend-verification` accepts `{ email }`
- [ ] If user exists and is `pending_verification`: invalidate any existing unused tokens, generate new token, queue new email
- [ ] Returns `200` with generic message regardless of whether the email exists (prevents user enumeration)
- [ ] Rate limited: max 3 resend requests per email per hour
- [ ] If user is already `active`: return `200` with "Your email is already verified" message
- [ ] Resend button available on the login page when a `pending_verification` user attempts to log in
- [ ] Audit log entry: `action: VERIFICATION_EMAIL_RESENT`

---

### ITER-1-008 · Authentication (Login)

**As a** registered and verified user  
**I want** to log in to the platform  
**So that** I can access my account and features

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/login` accepts `{ email, password }` (and `{ totpCode }` if MFA enabled)
- [ ] Returns `401` with generic "Invalid credentials" for wrong email or password (never differentiate)
- [ ] Checks `status`: `pending_verification` → `403` with message to verify email; `disabled` → `403` with message
- [ ] On success (no MFA): issues short-lived **access token** (JWT, 15 min) in response body + **refresh token** (HttpOnly, Secure, SameSite=Strict cookie, 7-day rolling)
- [ ] On success (MFA enabled): returns `{ mfaRequired: true, sessionChallenge: <ephemeral token> }` → separate MFA step
- [ ] Failed login increments `failed_login_attempts`; after 5 failures, sets `locked_until` for 30 mins
- [ ] `locked_until` checked on each login attempt; locked users receive `423` with time remaining
- [ ] Refresh token stored as hash in `user_sessions` with `device_fingerprint`, `ip_address`, `user_agent`
- [ ] Audit log entry: `action: USER_LOGIN_SUCCESS` or `USER_LOGIN_FAILED`
- [ ] Rate limiting: 10 attempts per IP per 15 minutes

---

### ITER-1-009 · Token Refresh & Session Management

**As an** authenticated user  
**I want** my session to remain active without repeated logins  
**So that** my experience is seamless during a working session

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/refresh` reads refresh token from HttpOnly cookie
- [ ] Validates token against hashed value in `user_sessions`
- [ ] On success: issues new access token + **rotates** refresh token (old one invalidated, new one set in cookie)
- [ ] Refresh token rotation implemented — replayed tokens immediately revoke all sessions for that user (detect token theft)
- [ ] `GET /api/v1/auth/sessions` returns list of active sessions for the current user (device, IP, last used)
- [ ] `DELETE /api/v1/auth/sessions/:sessionId` allows user to revoke a specific session
- [ ] `DELETE /api/v1/auth/sessions` (logout-all) revokes all sessions for current user

---

### ITER-1-010 · Logout

**As an** authenticated user  
**I want** to log out  
**So that** my session is terminated securely

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/logout` revokes current refresh token (sets `revoked_at` in `user_sessions`)
- [ ] Clears the refresh token HttpOnly cookie (set expired)
- [ ] Frontend clears access token from memory on logout
- [ ] Logout redirect to login page
- [ ] Audit log entry: `action: USER_LOGOUT`
- [ ] Attempting to use a revoked refresh token returns `401`

---

### ITER-1-011 · Password Reset

**As a** user who has forgotten their password  
**I want** to reset my password via email  
**So that** I can regain access to my account

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/forgot-password` accepts `{ email }`; always returns `200` with generic message (prevents enumeration)
- [ ] If user exists and is active: generates reset token, stores hash in `password_reset_tokens`, queues email
- [ ] Reset link expires after 1 hour
- [ ] `POST /api/v1/auth/reset-password` accepts `{ token, newPassword }`
- [ ] On success: updates password hash, invalidates token, revokes all existing sessions (force re-login)
- [ ] Password must meet same strength rules as registration
- [ ] Audit log entry: `action: PASSWORD_RESET_REQUESTED` and `PASSWORD_RESET_COMPLETED`
- [ ] Rate limited: 3 reset requests per email per hour

---

### ITER-1-012 · MFA Setup & Verification

**As an** authenticated user (or forced by admin for admin roles)  
**I want** to enable TOTP-based MFA  
**So that** my account has a second layer of protection

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/mfa/setup` generates a TOTP secret, returns `{ secret, qrCodeDataUrl, backupCodes }`
- [ ] QR code scannable by Google Authenticator, Authy, 1Password etc.
- [ ] 8 one-time backup codes generated (hashed), stored in DB
- [ ] `POST /api/v1/auth/mfa/confirm` accepts `{ totpCode }` to activate MFA; sets `mfa_enabled=true`
- [ ] `POST /api/v1/auth/mfa/disable` requires current password + TOTP code to disable
- [ ] Login flow: when `mfa_enabled`, login returns `{ mfaRequired: true }` → `POST /api/v1/auth/mfa/verify` with TOTP code to complete login
- [ ] MFA is **mandatory** for `system_admin` and `super_admin` roles
- [ ] Backup code can be used once in place of TOTP; used backup codes are invalidated
- [ ] Audit log entries: `MFA_ENABLED`, `MFA_DISABLED`, `MFA_VERIFY_SUCCESS`, `MFA_VERIFY_FAILED`

---

### ITER-1-013 · User Roles & Permissions

**As a** platform architect  
**I want** a well-defined role hierarchy  
**So that** access control is clear and enforceable

**Role Definitions:**

| Role | Description | Key Permissions |
|---|---|---|
| `super_admin` | God user — full unrestricted access | All permissions; can manage system admins |
| `system_admin` | Platform administrator | User management, audit logs, system logs, system settings |
| `asset_manager` | Professional portfolio manager | Manage portfolios they are assigned to |
| `asset_owner` | Owns portfolios | View/manage their own portfolios |

**Acceptance Criteria:**
- [ ] Role enum defined in DB and Prisma schema
- [ ] `requireAuth` middleware validates access token, attaches `req.user` with `id`, `role`, `email`
- [ ] `requireRole(...roles)` middleware factory enforces role-based access on routes
- [ ] Middleware returns `401` if no/invalid token, `403` if insufficient role
- [ ] Role check utility function available server-side: `hasPermission(user, action)`
- [ ] Frontend role-aware routing: role-specific redirects on login, route guards for admin pages
- [ ] Unit tests cover all middleware paths

---

### ITER-1-014 · Admin Panel — User Management

**As a** system administrator  
**I want** a web-based admin panel to manage users  
**So that** I can perform all user lifecycle operations without direct database access

**Acceptance Criteria:**
- [ ] Admin panel accessible at `/admin` (system_admin and super_admin only)
- [ ] **User list** with columns: Name, Email, Role, Status, Created, Last Login; sortable + filterable + paginated (cursor-based, 25/50/100 per page)
- [ ] **Create user**: Form to create user with role assignment; sends verification email
- [ ] **Update user**: Edit name, email, role
- [ ] **Enable / Disable user**: Toggle `status` (disabled users are immediately logged out — all sessions revoked)
- [ ] **Delete user**: Soft-delete (sets `deleted_at`); confirmation modal required
- [ ] **Promote/Demote role**: Change user role with audit trail
- [ ] **Reset user MFA**: Super admin can reset MFA for a user (forces re-setup)
- [ ] **View user sessions**: See active sessions, ability to revoke any
- [ ] All admin actions require re-authentication if session is >30 min old (step-up auth)
- [ ] All actions produce audit log entries

---

### ITER-1-015 · System Settings (Admin)

**As a** system administrator  
**I want** to manage system-wide settings via the admin panel  
**So that** platform behaviour can be adjusted without redeployment

**Acceptance Criteria:**
- [ ] Settings accessible at `/admin/settings`
- [ ] `SELF_REGISTRATION_ENABLED` toggle (boolean)
- [ ] `MAX_LOGIN_ATTEMPTS` (number, default 5)
- [ ] `ACCOUNT_LOCKOUT_MINUTES` (number, default 30)
- [ ] `EMAIL_VERIFICATION_EXPIRY_HOURS` (number, default 24)
- [ ] `PASSWORD_RESET_EXPIRY_HOURS` (number, default 1)
- [ ] Settings changeable via UI and `PATCH /api/v1/admin/settings/:key` (mirror RMS pattern)
- [ ] Settings read on every relevant operation (not cached longer than 60s — use Redis TTL)
- [ ] Audit log entry on every setting change: `action: SETTING_UPDATED`, `old_value`, `new_value`
- [ ] Only `super_admin` can change settings

---

### ITER-1-016 · Audit Logging

**As a** system administrator  
**I want** a complete, tamper-evident audit log of all meaningful system events  
**So that** I can investigate incidents and meet compliance requirements

**Acceptance Criteria:**
- [ ] `audit_logs` table stores: `actor_id`, `actor_role`, `action` (enum), `entity_type`, `entity_id`, `old_value` (JSONB), `new_value` (JSONB), `ip_address`, `user_agent`, `created_at`
- [ ] Audit log entries are **append-only** (no update or delete permitted — DB trigger prevents it)
- [ ] All authentication events logged: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, PASSWORD_RESET, MFA events
- [ ] All user management events logged: USER_CREATED, USER_UPDATED, USER_ENABLED, USER_DISABLED, USER_DELETED, ROLE_CHANGED
- [ ] All settings changes logged
- [ ] `GET /api/v1/admin/audit-logs` supports filtering by: `actorId`, `action`, `entityType`, `entityId`, `dateFrom`, `dateTo`; paginated cursor-based
- [ ] Audit log UI in admin panel: table view with filters, date range picker, search
- [ ] Audit log entries include `ip_address` extracted from `X-Forwarded-For` (behind Nginx) safely
- [ ] Monthly partitioning verified working (query spanning multiple months returns correct results)
- [ ] Export to CSV from admin UI

---

### ITER-1-017 · System Logging

**As a** system administrator  
**I want** structured system logs with a viewing interface  
**So that** I can diagnose issues without SSH access to servers

**Acceptance Criteria:**
- [ ] Winston configured in API with levels: `debug` (dev only), `info`, `warn`, `error`, `fatal`
- [ ] All logs output as structured JSON: `{ level, message, service, traceId, timestamp, ...context }`
- [ ] `traceId` (UUID) generated per request and propagated through all log entries for that request
- [ ] `traceId` returned in API response header `X-Trace-Id` for client-side debugging
- [ ] Logs written to: stdout (always) + daily rotating log files in `logs/` (retained 30 days)
- [ ] Unhandled exceptions and unhandled promise rejections captured and logged as `fatal`
- [ ] `system_logs` DB table populated for `warn`, `error`, `fatal` level events (lower levels too verbose for DB)
- [ ] `GET /api/v1/admin/system-logs` supports filtering by: `level`, `service`, `dateFrom`, `dateTo`, `traceId`; paginated
- [ ] System log UI in admin panel with level-colour coding and trace-ID drill-down
- [ ] Log viewing restricted to `system_admin` and `super_admin`

---

### ITER-1-018 · CI/CD Pipeline (GitHub Actions)

**As a** developer  
**I want** automated CI/CD via GitHub Actions  
**So that** every push is tested and the dev environment is automatically updated

**Acceptance Criteria:**

**CI Workflow (`ci.yml`) — runs on push and PR:**
- [ ] Starts PostgreSQL 16 and Redis 7 as service containers
- [ ] Runs Prisma migrations against test DB
- [ ] TypeScript type-check (`tsc --noEmit`) for all packages
- [ ] ESLint check across all packages
- [ ] API unit tests (`jest`) — all must pass
- [ ] Web unit tests (`vitest`) — all must pass
- [ ] Tests use per-worker port assignment to prevent collision (mirror RMS fix)
- [ ] CI reports coverage (threshold: 80% for auth module)

**CD Workflow (`deploy-dev.yml`) — runs on push to `main`:**
- [ ] Only triggers after CI passes
- [ ] Builds Docker image for API
- [ ] Pushes image to container registry (GitHub Container Registry)
- [ ] Deploys to remote dev environment
- [ ] Runs `db:migrate` against remote dev DB post-deploy
- [ ] Posts deploy status to GitHub commit status checks

**Security Workflow (`security.yml`) — runs weekly + on PR:**
- [ ] `npm audit` — fails on high/critical vulnerabilities
- [ ] `trivy` Docker image scan
- [ ] Dependency review on PRs

---

### ITER-1-019 · API Documentation

**As a** developer  
**I want** auto-generated API documentation  
**So that** the frontend team and future integrators can reference all endpoints

**Acceptance Criteria:**
- [ ] Swagger/OpenAPI 3.0 spec auto-generated from route definitions (use `swagger-jsdoc` or `fastify-swagger`)
- [ ] Available at `GET /api/docs` (dev and staging environments only, not production)
- [ ] All Iteration 1 endpoints documented with request/response schemas
- [ ] Auth endpoints include example requests

---

### ITER-1-020 · Security Hardening (Baseline)

**As a** platform owner  
**I want** baseline security measures in place from day one  
**So that** the application is not trivially vulnerable

**Acceptance Criteria:**
- [ ] `helmet.js` applied to all API responses (sets CSP, HSTS, X-Frame-Options etc.)
- [ ] CORS configured: whitelist of allowed origins via `ALLOWED_ORIGINS` env var
- [ ] All auth endpoints rate-limited (Redis sliding window via `express-rate-limit` + `rate-limit-redis`)
- [ ] Request body size limited (default 100kb; file upload routes handled separately)
- [ ] SQL injection not possible (Prisma parameterized queries — verify no raw queries used)
- [ ] All user inputs sanitised (Zod parsing on all request bodies)
- [ ] `Content-Security-Policy` headers set on web app (Vite build + Nginx)
- [ ] HTTP → HTTPS redirect enforced on remote environments (Nginx)
- [ ] Secrets never logged (audit logger strips `password`, `token`, `secret`, `mfa_secret` fields)
- [ ] `npm audit` passes with no high/critical vulnerabilities at time of delivery

---

## Iteration 1 Delivery Checklist

| Story | Title | Status |
|---|---|---|
| ITER-1-001 | Project Scaffold & Monorepo Setup | ✅ |
| ITER-1-002 | Local Development Environment | ✅ |
| ITER-1-003 | Remote Development Environment | ➡️ Tech Debt |
| ITER-1-004 | Database Schema & Migrations | ✅ |
| ITER-1-005 | User Registration | ✅ |
| ITER-1-006 | Email Verification | ✅ |
| ITER-1-007 | Resend Email Verification | ✅ |
| ITER-1-008 | Authentication (Login) | ✅ |
| ITER-1-009 | Token Refresh & Session Management | ✅ |
| ITER-1-010 | Logout | ✅ |
| ITER-1-011 | Password Reset | ✅ |
| ITER-1-012 | MFA Setup & Verification | ✅ |
| ITER-1-013 | User Roles & Permissions | ✅ |
| ITER-1-014 | Admin Panel — User Management | ✅ |
| ITER-1-015 | System Settings (Admin) | ✅ |
| ITER-1-016 | Audit Logging | ✅ |
| ITER-1-017 | System Logging | ✅ |
| ITER-1-018 | CI/CD Pipeline | ✅ |
| ITER-1-019 | API Documentation | ✅ |
| ITER-1-020 | Security Hardening Baseline | ✅ |

**Iteration 1 status: COMPLETE** (19/20 stories delivered; ITER-1-003 deferred to tech debt — see below)

---

## Tech Debt

### TD-001 · Remote Development Environment Setup

**Deferred from:** ITER-1-003  
**Reason:** Requires manual cloud infrastructure provisioning; does not block any Iteration 1 functional requirements. CI/CD pipeline (ITER-1-018) and deploy workflow are fully built and ready — only the target infrastructure is missing.

**Work required:**
- [ ] Provision a remote PostgreSQL instance; store credentials as `DEV_DATABASE_URL` in GitHub Secrets (`dev` environment)
- [ ] Provision a remote Redis instance (Upstash free tier acceptable); store as `REDIS_URL`
- [ ] Deploy API and web app to a stable URL (Railway, Render, or VPS)
- [ ] Configure `DEV_HOST`, `DEV_SSH_USER`, `DEV_SSH_KEY` GitHub Secrets to enable the SSH deploy step in `deploy-dev.yml`
- [ ] Enforce HTTPS on all remote endpoints (Nginx HTTP → HTTPS redirect already in `infra/nginx/nginx.conf`)
- [ ] Document all remote env vars in `infra/env.remote-dev.example`
- [ ] Verify PM2 or equivalent process manager is running the API on the remote server

---

*Document version 1.0 — April 2026 | Asset Manager Project*

---

## 8. Epic: ITER-2 — Application Shell, Admin Dashboard & User Profile {#epic-2}

**Epic ID:** ITER-2  
**Epic Title:** Application Shell, Admin Dashboard & User Profile  
**Goal:** Replace the placeholder scaffold with a polished, production-quality application shell (sidebar + header) shared across both the admin and app surfaces; deliver a live admin dashboard with real-time stats; restructure admin navigation; and give users a profile page with self-service password change.  
**Definition of Done:** All user stories below checked off with acceptance criteria met, CI green, dark-mode works end-to-end, no regressions on Iteration 1 flows.

---

## 9. User Stories — Iteration 2 {#user-stories-2}

---

### ITER-2-001 · Application Shell — Sidebar + Header Layout

**As a** user (admin or app)  
**I want** a consistent sidebar-and-header layout across the whole application  
**So that** navigation is familiar, accessible, and looks professional on all screen sizes

**Design reference:** "Sidebar with header" variant — https://tailwindcss.com/plus/ui-blocks/application-ui/application-shells/sidebar

**Acceptance Criteria:**
- [ ] A shared `AppShell` layout component is created in `apps/web/src/components/AppShell.tsx`
- [ ] Layout comprises: fixed left sidebar (collapses to icon-only on mobile), top header bar, and a scrollable main content area
- [ ] Sidebar contains: app logo/name at the top, primary navigation links, and a user avatar + name at the bottom
- [ ] Header bar contains: page title (dynamic, set by each page), and the user profile menu on the right
- [ ] No search bar is present (explicitly excluded per requirements)
- [ ] Sidebar is fully responsive: collapses off-canvas on mobile, toggled by a hamburger button in the header
- [ ] Active navigation item is highlighted with a distinct active style
- [ ] All existing admin pages (`/admin/*`) and the app scaffold (`/`) are wrapped by `AppShell`
- [ ] Auth pages (login, register, forgot-password, reset-password, verify-email, MFA) remain full-screen and do **not** use `AppShell`
- [ ] Layout renders correctly in both light and dark mode (see ITER-2-002)

**Notes:** The admin and app surfaces share the same `AppShell` component; the navigation items rendered inside differ based on role (see ITER-2-003 and ITER-2-004).

---

### ITER-2-002 · Dark Mode Theme Switcher

**As a** user  
**I want** to toggle between light and dark mode  
**So that** I can use the application comfortably in any lighting environment

**Acceptance Criteria:**
- [ ] A theme toggle button (sun/moon icon) is visible in the header bar on every page that uses `AppShell`
- [ ] Clicking it switches between `light` and `dark` mode immediately without a page reload
- [ ] Theme preference is persisted in `localStorage` and restored on next visit
- [ ] On first visit, the system preference (`prefers-color-scheme`) is used as the default
- [ ] Dark mode is implemented using Tailwind CSS's `class` strategy (`darkMode: 'class'` in `tailwind.config.ts`), toggling the `dark` class on `<html>`
- [ ] All `AppShell` surfaces (sidebar, header, content area) have correct dark-mode colour variants
- [ ] No flash of incorrect theme on page load (theme class applied before first paint via an inline script in `index.html`)

---

### ITER-2-003 · Admin Navigation Structure

**As an** admin user  
**I want** a clear, well-organised admin navigation in the sidebar  
**So that** I can move between admin functions without becoming lost

**Acceptance Criteria:**
- [ ] Admin sidebar navigation contains exactly the following items (in order):
  - **Dashboard** → `/admin` (home icon)
  - **Settings** (collapsible group, chevron toggle):
    - User Management → `/admin/users`
    - System Settings → `/admin/settings`
  - **Monitor** (collapsible group, chevron toggle):
    - Audit Logs → `/admin/audit-logs`
    - System Logs → `/admin/system-logs`
- [ ] Collapsible groups expand/collapse with a smooth transition and retain their open/closed state across navigation (stored in component state or `localStorage`)
- [ ] The active page is highlighted within nested groups with the parent group remaining visually open
- [ ] Navigation is only rendered for users with role `super_admin` or `system_admin`; other roles see the app navigation (ITER-2-004)
- [ ] Sidebar shows the Asset Manager logo at the top

---

### ITER-2-004 · App (Non-Admin) Navigation Structure

**As a** non-admin user (`asset_manager`, `asset_owner`)  
**I want** an appropriate navigation sidebar for my role  
**So that** I only see the features relevant to me

**Acceptance Criteria:**
- [ ] App sidebar navigation (for non-admin roles) contains a placeholder "Dashboard" item → `/` with a home icon
- [ ] A note/placeholder section indicates "Asset management features coming in Iteration 3"
- [ ] Non-admin users cannot navigate to any `/admin/*` route (existing `ProtectedRoute` + `requireRole` guards remain in place)
- [ ] The sidebar footer shows the user's name, email, and avatar (initials-based if no photo)

---

### ITER-2-005 · User Profile Menu & Sign Out

**As an** authenticated user  
**I want** to access my profile and sign out from a dropdown in the header  
**So that** I can manage my account and end my session without hunting for a logout button

**Acceptance Criteria:**
- [ ] Clicking the avatar/name in the header (or sidebar footer) opens a dropdown menu
- [ ] Dropdown contains:
  - User's full name and email (non-interactive, displayed at top of dropdown)
  - **My Profile** → navigates to `/profile`
  - **Sign out** → calls `POST /api/v1/auth/logout`, clears auth state, redirects to `/login`
- [ ] Dropdown closes when clicking outside it or pressing Escape
- [ ] Sign out clears the Zustand auth store and removes the persisted user from `localStorage`
- [ ] Dropdown is keyboard-accessible (arrow keys, Enter, Escape)
- [ ] The avatar displays the user's initials (first + last name) in a coloured circle if no profile photo is set

---

### ITER-2-006 · User Profile Page

**As an** authenticated user  
**I want** a profile page where I can view my details and change my password  
**So that** I can keep my account information up to date without contacting an admin

**Acceptance Criteria:**
- [ ] Route `/profile` is accessible to all authenticated roles and rendered inside `AppShell`
- [ ] Page displays: full name, email address, role (read-only badge), account status, MFA status (enabled/disabled), account creation date
- [ ] **Change password** section: current password field + new password field + confirm new password field
- [ ] New password validated client-side with the same rules as registration (min 12 chars, upper, lower, number, special)
- [ ] On submit, calls `PATCH /api/v1/auth/profile/password` (new endpoint — see notes)
- [ ] Success: shows an inline success message; all other sessions are revoked (user must re-login on other devices)
- [ ] Failure (wrong current password): shows a clear inline error message
- [ ] Back navigation returns to the previous page or `/` if no history

**API (new endpoint):**
- `PATCH /api/v1/auth/profile/password` — authenticated, body: `{ currentPassword, newPassword }`
- Verifies `currentPassword` against stored hash; if correct, hashes and stores `newPassword`, revokes all other sessions, returns `200 { message }`
- Returns `400` if validation fails, `401` if current password is wrong

---

### ITER-2-007 · Admin Dashboard — Live User Activity Stats

**As an** admin  
**I want** to see real-time active user counts on the dashboard  
**So that** I can monitor platform engagement at a glance

**Design reference:** "With brand icon" stats — https://tailwindcss.com/plus/ui-blocks/application-ui/data-display/stats

**Acceptance Criteria:**
- [ ] Dashboard (`/admin`) displays a stats row with three "with brand icon" cards:
  - **Admin Users Online** — count of active admin sessions in the last 5 minutes
  - **App Users Online** — count of active non-admin sessions in the last 5 minutes
  - **Total Online** — sum of both
- [ ] Stats auto-refresh every 5 minutes without a full page reload (polling via TanStack Query `refetchInterval`)
- [ ] A "last updated" timestamp is shown beneath the stats row
- [ ] A line chart (using `recharts`) shows total active users over the last 24 hours (one data point per hour, sourced from `user_sessions` activity)
- [ ] API endpoint `GET /api/v1/admin/dashboard/active-users` returns `{ adminCount, appCount, total, history: [{ hour, count }] }` — admin + step-up auth required
- [ ] Stats cards are responsive: stack vertically on mobile, 3-column row on desktop

---

### ITER-2-008 · Admin Dashboard — Top Pages & Per-URL Activity

**As an** admin  
**I want** to see which pages are most active right now  
**So that** I can understand where users are spending time in the application

**Acceptance Criteria:**
- [ ] Dashboard includes a "Top 5 Active Pages" table below the stats row
- [ ] Table columns: **Page (URL path)**, **Active Users** (sessions that last requested this path within 5 minutes)
- [ ] Table auto-refreshes every 5 minutes alongside the stats cards
- [ ] Page activity data is sourced from a new `page_views` table (or an in-memory Redis sorted set keyed by path — Redis preferred for performance)
- [ ] The web app records page views by calling `POST /api/v1/telemetry/pageview` with `{ path }` on each route change (non-blocking fire-and-forget)
- [ ] Admin API endpoint `GET /api/v1/admin/dashboard/page-activity` returns `{ pages: [{ path, activeUsers }] }` (top 5, sorted descending)
- [ ] No PII is stored — only the URL path and an anonymised session token are recorded
- [ ] Telemetry endpoint is open (no auth required) but rate-limited per session

---

### ITER-2-009 · Admin Dashboard — Service Health Status

**As an** admin  
**I want** to see a live health status for the API, web app, and worker services on the dashboard  
**So that** I can immediately detect if any part of the platform is degraded

**Acceptance Criteria:**
- [ ] Dashboard includes a "Service Health" section with three status indicators:
  - **API** — result of `GET /health`
  - **Web App** — reachability of the web frontend origin
  - **Worker** — worker heartbeat (Redis key `worker:heartbeat` updated every 30 s by the worker process)
- [ ] Each indicator shows: service name, coloured status badge (`Healthy` / `Degraded` / `Offline`), and last-checked timestamp
- [ ] Section auto-refreshes every 5 minutes
- [ ] Worker posts a heartbeat to Redis every 30 seconds: `SET worker:heartbeat <timestamp> EX 90`; if the key is absent or older than 90 s the status shows `Offline`
- [ ] API endpoint `GET /api/v1/admin/dashboard/health` returns `{ api, worker }` status objects — public (no auth) for the API self-check, auth required for worker status
- [ ] Status indicators are colour-coded: green = healthy, amber = degraded, red = offline

---

### ITER-2-010 · Database Schema Changes — Iteration 2

**As a** developer  
**I want** all new Iteration 2 database tables and columns created via Prisma migrations  
**So that** schema changes are version-controlled and reproducible

**Acceptance Criteria:**
- [ ] New migration adds a `page_views` table (or confirms Redis-only approach is used — if Redis, document the key schema)
- [ ] If DB approach chosen: `page_views` — `id`, `session_token` (anonymised), `path` (varchar 500), `created_at`; indexed on `(path, created_at)`; old records purged after 24 hours via a scheduled worker job
- [ ] Migration for the `users` table: no new columns required in Iter 2, but confirm `updated_at` trigger is in place for `PATCH /auth/profile/password`
- [ ] All new migrations committed to `packages/db/migrations/`
- [ ] `db:migrate` and `db:seed` scripts continue to work cleanly after new migrations
- [ ] Prisma client regenerated and types updated in `packages/db`

---

### ITER-2-011 · CI Updates — Iteration 2

**As a** developer  
**I want** the CI pipeline to validate all Iteration 2 changes  
**So that** regressions are caught automatically before merge

**Acceptance Criteria:**
- [ ] Existing CI workflow (`ci.yml`) continues to pass with all Iter 2 code changes
- [ ] New API endpoint tests added for: `PATCH /auth/profile/password`, `GET /admin/dashboard/active-users`, `GET /admin/dashboard/page-activity`, `GET /admin/dashboard/health`
- [ ] Web app TypeScript type-check (`tsc --noEmit`) passes with no errors
- [ ] Test suite count does not decrease from Iteration 1 baseline (202 tests)

---

## Iteration 2 Delivery Checklist

| Story | Title | Status |
|---|---|---|
| ITER-2-001 | Application Shell — Sidebar + Header Layout | ⬜ |
| ITER-2-002 | Dark Mode Theme Switcher | ⬜ |
| ITER-2-003 | Admin Navigation Structure | ⬜ |
| ITER-2-004 | App (Non-Admin) Navigation Structure | ⬜ |
| ITER-2-005 | User Profile Menu & Sign Out | ⬜ |
| ITER-2-006 | User Profile Page | ⬜ |
| ITER-2-007 | Admin Dashboard — Live User Activity Stats | ⬜ |
| ITER-2-008 | Admin Dashboard — Top Pages & Per-URL Activity | ⬜ |
| ITER-2-009 | Admin Dashboard — Service Health Status | ⬜ |
| ITER-2-010 | Database Schema Changes — Iteration 2 | ⬜ |
| ITER-2-011 | CI Updates — Iteration 2 | ⬜ |

---

*Document version 2.0 — April 2026 | Asset Manager Project*