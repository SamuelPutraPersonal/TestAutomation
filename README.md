# Warehouse & Order Fulfillment Portal (WFP)

A full-stack Warehouse & Order Fulfillment Portal combined with a built-in **Automation Practice Lab**, designed to double as a realistic, deliberately testable application for practicing and demonstrating test automation (Playwright, Selenium, API testing, etc.).

It models a small warehouse operation: SKU/inventory management, order lifecycle management (allocation → packing → shipping), role-based access control, and an immutable audit trail — all the ingredients you'd expect to test in a real enterprise system.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Enterprise Testability Features](#enterprise-testability-features)
- [Automation Practice Lab](#automation-practice-lab)
- [Getting Started Locally](#getting-started-locally)
- [Test Automation](#test-automation)
- [Project Structure](#project-structure)

## Project Overview

WFP is split into two independent apps that talk over a JSON REST API:

- **`backend/`** — a Fastify API server backed by PostgreSQL, owning auth, inventory, orders, and audit logging.
- **`frontend/`** — a Next.js app that consumes the API: a dashboard, inventory and order management screens, an admin-only audit log, and the Automation Practice Lab.

The two pieces run independently in development (`npm run dev` in each), with PostgreSQL provided via Docker Compose.

## Architecture & Tech Stack

### Backend

- **Node.js** + **TypeScript**
- **Fastify 5** — HTTP server, with `@fastify/jwt`, `@fastify/cookie`, `@fastify/cors`, and `@fastify/swagger` / `swagger-ui` for API docs
- **PostgreSQL 16** (via Docker)
- **Prisma 6** — ORM, migrations, and type-safe query client
- **JWT auth in HTTP-only cookies** — short-lived access tokens plus rotating, single-use refresh tokens (reuse of a revoked refresh token revokes its entire token family, i.e. theft detection)
- **Zod** — request/response schema validation (via `fastify-type-provider-zod`)
- **bcryptjs** — password hashing

### Frontend

- **Next.js 16** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **TanStack Query 5** — server-state fetching, caching, and polling

## Enterprise Testability Features

WFP is built to exercise the kinds of behaviors automation suites actually need to cover in production systems:

- **Role-Based Access Control (RBAC)** — `ADMIN` and `OPERATOR` roles; admin-only surfaces (e.g. the Audit Log) are hidden and enforced both in the UI and at the API layer.
- **Optimistic locking** — `Sku` and `Order` records carry a `version` column; updates are conditioned on `WHERE id = ? AND version = ?`, so concurrent-edit conflicts are reproducible and testable.
- **Order state machine** — orders move through a defined lifecycle (`PENDING → ALLOCATED → PACKED → SHIPPED`, with `CANCELLED` as a terminal branch), with timestamps recorded at each transition.
- **Async background shipping jobs** — marking an order as packed kicks off a simulated background worker that ships it after a configurable delay (`SHIPMENT_JOB_DELAY_MS`), useful for practicing polling/wait strategies.
- **Database-level audit log immutability** — the `AuditLog` table is append-only; a Postgres trigger (added in migration) rejects `UPDATE`/`DELETE` statements outright, so immutability is enforced below the application layer, not just in code.

## Automation Practice Lab

The frontend ships a dedicated **Practice Lab** tab (`/practice`, linked from the sidebar) purpose-built for exercising common browser-automation patterns. Every interactive element carries an explicit `data-testid` so it can be targeted reliably:

- **Mouse interactions** — a click counter (`click-me-btn`, `click-count-display`), a double-click target with status text (`double-click-btn`, `double-click-status`), and a hover-triggered element (`hover-box`).
- **Forms & inputs** — a native `<select>` dropdown (`practice-dropdown`, `dropdown-result`) and a set of checkboxes (`checkbox-1`, `checkbox-2`, `checkbox-3`).
- **Dynamic elements & waits** — a toggle that shows/hides an element (`toggle-dynamic-btn`, `dynamic-target-box`), and a simulated async fetch with a loading spinner and success message (`load-data-btn`, `loading-spinner`, `success-loaded-msg`).
- **Text input & mirroring** — a text field whose value is mirrored live into an output element (`practice-text-input`, `text-output-mirror`).

This page requires no authentication beyond normal login and has no side effects on warehouse data, so it's safe to script against repeatedly.

## Getting Started Locally

### Prerequisites

- Node.js 20+
- Docker / Docker Compose
- npm

### 1. Start PostgreSQL via Docker

From the project root:

```bash
cp .env.example .env
docker compose up -d
```

This starts a `postgres:16-alpine` container (service `db`) with a health check, exposed on `localhost:5432` by default.

### 2. Configure and set up the backend

```bash
cd backend
cp ../.env.example .env   # adjust DATABASE_URL etc. if needed
npm install
npm run prisma:generate
npm run prisma:migrate     # applies migrations, including the audit-log immutability trigger
npm run db:seed            # seeds demo users, SKUs, and orders
```

### 3. Run the backend

```bash
npm run dev
```

The API starts on **http://localhost:4000** (configurable via `PORT`), with Swagger docs available at `/docs`.

### 4. Configure and run the frontend

In a separate terminal:

```bash
cd frontend
cp ../.env.example .env.local   # ensure NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev
```

The app starts on **http://localhost:3000**. Log in with a seeded user (see `backend/prisma/seed` for credentials), then explore the Dashboard, Inventory, Orders, Audit Log (admin only), and Practice Lab.

## Test Automation

Playwright is the primary tool for exercising this app end-to-end (the Practice Lab's `data-testid` attributes are purpose-built for it), and the Fastify API is equally scriptable for API-level tests.

### Initializing Playwright

From the project root (or a dedicated `e2e/` folder):

```bash
npm init playwright@latest
```

Point `baseURL` in `playwright.config.ts` at the running frontend (`http://localhost:3000`), and ensure both the backend and frontend dev servers (and the Postgres container) are running before executing tests.

### Running tests

```bash
npx playwright test             # run the full E2E suite headlessly
npx playwright test --ui        # interactive UI mode
npx playwright show-report      # view the HTML report after a run
```

### API testing

The backend's REST endpoints (`http://localhost:4000/api/...`) can be exercised directly with Playwright's `request` fixture, Supertest, Postman/Newman, or any HTTP client — useful for testing RBAC enforcement, optimistic-locking conflicts, and order state transitions without going through the UI.

## Project Structure

```
.
├── backend/              # Fastify API server
│   ├── prisma/           # Schema, migrations, seed script
│   └── src/
│       ├── modules/      # Feature modules (auth, inventory, orders, audit, ...)
│       ├── jobs/         # Background workers (e.g. simulated shipping job)
│       ├── middleware/   # Auth/RBAC guards
│       ├── plugins/      # Fastify plugins (jwt, cors, swagger, ...)
│       └── server.ts     # Entry point
├── frontend/              # Next.js app
│   └── src/
│       └── app/
│           └── (app)/    # Authenticated routes: dashboard, inventory, orders,
│                          # audit-logs, practice (Automation Practice Lab)
├── docker-compose.yml     # PostgreSQL service for local development
└── .env.example           # Environment variable reference for all services
```
