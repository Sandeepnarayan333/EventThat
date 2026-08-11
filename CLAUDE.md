# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EventHub — a full-stack ticket booking app. Next.js 14 (App Router) frontend, Express.js backend, MySQL via Prisma ORM. Root `package.json` orchestrates both halves; there's no monorepo tool (no Turborepo/Nx), just `--prefix`.

## Commands

```bash
npm run setup          # install deps in both backend/ and frontend/
npm run dev            # run both servers concurrently (API on :3001, web on :3000)
npm run db:push        # push Prisma schema to DB, non-interactive
npm run migrate         # prisma migrate dev — interactive, creates backend/prisma/migrations/*
npm run seed            # insert 10 sample events (backend/prisma/seed.js)
npm run build            # next build (frontend only)
npm run lint              # next lint (frontend only; backend has no lint script)
npm run test               # npx playwright test
npm run test:ui              # playwright UI mode
```

Backend-only (run from `backend/`): `npm run dev` (nodemon), `npm run prisma:studio`.

Single Playwright test: `npx playwright test tests/booking-management.spec.js -g "test name"`.

**Playwright's `baseURL` in [playwright.config.ts](playwright.config.ts) points at a hosted deployment (`https://eventhub.rahulshettyacademy.com`), not localhost.** `npm run test` does not spin up or hit the local dev servers — it exercises the live remote site. Keep this in mind before assuming a test run reflects local changes.

## Backend architecture

Layered, one direction of dependency: `routes → controllers → services → repositories → prisma`.

- **Routes** (`backend/src/routes/`) — Express routers, validation middleware wiring, full Swagger JSDoc annotations inline (this is also how `/api/docs` gets its spec).
- **Controllers** — thin HTTP glue only; no business logic.
- **Services** — business rules, transactions, all domain error throwing (`NotFoundError`, `InsufficientSeatsError`, `ForbiddenError`, `ValidationError` from `backend/src/utils/errors.js`).
- **Repositories** — pure Prisma queries, no business logic.
- **`backend/src/middleware/errorHandler.js`** is the single place HTTP status codes get decided: it maps the domain error classes above, plus known Prisma error codes (`P2002` unique constraint → 409, `P2025` not found → 404, `P2003` FK violation → 400), to responses. Throw a domain error from a service rather than crafting a response in a controller.

Auth is stateless JWT (`backend/src/middleware/authMiddleware.js`): `Authorization: Bearer <token>` is verified and decoded into `req.user`; there's no session store. Token payload is `{ userId, email }`, 7-day expiry, signed with `JWT_SECRET` (defaults to a hardcoded dev value in `backend/src/config/env.js` if unset — set a real one outside local dev).

### Data model / ownership rule (non-obvious)

`Event.isStatic` distinguishes seeded/shared events (`isStatic: true`, visible to everyone) from user-created events (`isStatic: false`, private to their `userId`). Nearly every event query filters `OR: [{ isStatic: true }, { userId }]` (see `eventRepository.findAll`/`findById`) — a query that omits this filter will leak other users' private events. Bookings are always scoped strictly to `booking.userId === req.user.userId` (403 `ForbiddenError` otherwise), checked in the service layer, not the repository.

### Booking quirks (`backend/src/services/bookingService.js`)

- Users are capped at `MAX_USER_BOOKINGS = 9`. Hitting the cap on a new booking triggers FIFO pruning: the oldest booking for a *different* event is deleted first; if none exists, the oldest booking overall is deleted instead.
- If the pruned booking happened to be for the *same* event being booked (`sameEventFallback`), a seat is permanently burned via `eventRepository.decrementSeats` — otherwise deleting a booking just lets the availability recompute dynamically (`availableSeats` minus that user's other outstanding bookings for the event), it does **not** increment `availableSeats` back. Static/shared events and per-user dynamic events are therefore accounted differently; read this function fully before changing seat math.

## Frontend architecture

Next.js 14 App Router. Server state via React Query v5 (`frontend/lib/hooks/use*.ts`); global providers in `frontend/lib/providers.jsx`. `AuthGuard` (`frontend/components/auth/AuthGuard.tsx`) wraps the tree and redirects unauthenticated users to `/login` for any route not in its `PUBLIC_PATHS` allowlist — new top-level routes are protected by default unless added there.

`useAuth` (`frontend/lib/hooks/useAuth.tsx`) holds the JWT in `localStorage` under `eventhub_token` and re-validates it against `GET /api/auth/me` on mount.

`frontend/lib/api/client.ts` is the live Axios singleton: it attaches the bearer token on every request and, on any `401` response, clears the token and hard-redirects to `/login`. It also unwraps the backend's `{ success, data, pagination? }` envelope so callers get `data` directly, and normalizes errors to `Error` with `.status`/`.data` attached.

**Duplicate/dead API modules**: `frontend/lib/api/eventsApi.js`, `bookingsApi.js`, and `client.js` are unused leftovers — nothing imports them. The live modules are `events.ts`, `bookings.ts`, `client.ts` (re-exported from `lib/api/index.ts`) plus `authApi.js` (still used by `useAuth.tsx`, has no `.ts` counterpart). Edit the `.ts` files, not the `.js` ones, for events/bookings/client.

The codebase mixes `.jsx`/`.tsx` and `.js`/`.ts` per-file rather than being consistently typed — check what a neighboring file already uses before adding a new one.

## Testing strategy

[docs/test-strategy.md](docs/test-strategy.md) documents a deliberate test pyramid (Unit / API / Component / E2E) mapped from [docs/test-scenarios.md](docs/test-scenarios.md)'s 53 scenarios, with explicit rationale for which layer each rule belongs at and a list of anti-patterns to avoid (e.g. don't test validation boundaries or FIFO pruning at E2E — those belong at the API layer; don't E2E-test the refund-eligibility timer — that's a pure client-side `setTimeout`, belongs at Component level). Read it before adding new tests so coverage lands at the right layer instead of defaulting to E2E.

All key interactive elements carry `data-testid` attributes for Playwright — see the table in [README.md](README.md) for the full list before adding new ones (follow the existing naming convention: `kebab-case`, verb-first for actions e.g. `cancel-booking-btn`).
