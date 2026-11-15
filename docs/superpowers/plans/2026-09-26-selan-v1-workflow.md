# Selan V1 development prototype implementation plan

> **For agentic workers:** Use the existing isolated branch and verify every gate before calling a slice complete.

**Goal:** Make the existing intake, customer, Quibi-read, offer preparation, and appointment foundations usable as one truthful development workflow without external writes.

**Architecture:** Selan owns inquiry and case state; Quibi owns its customers and documents. A server-only adapter reads Quibi; tenant-scoped links store IDs and sync state. Existing Dashboard V1 remains visually intact and gains navigation to a case workspace. External write stages remain disabled until their contracts and business rules are approved.

**Tech Stack:** Next.js 16, TypeScript, Supabase Postgres/RLS, Node tests, GitHub Actions disposable Docker database.

## Slice 1 — database safety

- [ ] Extend isolated Actions to apply the complete ordered migration chain after the existing M3/M4 regression gates.
- [ ] Add Quibi link SQL regression: roles, tenant isolation, archived customer, duplicate internal/external IDs, no UPDATE/DELETE.
- [ ] Run on a disposable GitHub-hosted Docker stack with no hosted DB credentials.

## Slice 2 — Quibi reconciliation

- [ ] Add durable read/sync result state and a bounded manual retry path for linked customers.
- [ ] Add anonymized tests for remote change, transient error, recovery, and no Quibi write call.
- [ ] Keep Quibi customer/vehicle/estimate writes disabled; expose precise blockers.

## Slice 3 — central case workflow

- [ ] Add a case detail route reachable from Dashboard V1 without redesigning approved UI.
- [ ] Show canonical customer/vehicle, completeness, continuation link, Quibi match/read status, offer readiness, review/delivery blocker, and next action.
- [ ] Reuse existing actions and roles; do not invent quote evidence or customer approval.

## Slice 4 — scheduling and QA

- [ ] Inspect appointment constraints and business decision for paid preliminary inspection before implementing slot transitions.
- [ ] Provide clearly marked manual external handoff where safe; never imply Calendar/MyPlanly confirmation without evidence.
- [ ] Run lint, TypeScript, build, offline tests, isolated DB tests, and desktop/mobile browser review; inspect full diff and prepare a review PR.

**Approval boundary:** no hosted migrations, production deployment, PR merge, or write to Quibi dev. Paid-inspection ordering and external API contracts may block later steps but do not block slices 1–3.
