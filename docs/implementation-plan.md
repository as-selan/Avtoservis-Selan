# Avtoservis Selan — Master Implementation Plan

**Canonical project roadmap.** Implementation-oriented, phased, checkbox-driven.
Future sessions should treat this file as the source of truth for **what comes next**.

---

## Current status

| Item | Value |
|---|---|
| **Stable baseline** | `7e073f032fc8a195166b82b37b09c6e1946c8a01` (`main`) |
| **Current phase** | **Phase 1 — Architecture Freeze** |
| **Next immediate action** | Review and approve [Data Model & Auth Design V1](./data-model-auth-design-v1.md) before any migration |
| **Scope terms** | **Phase 1 administrative V1** = inquiry → confirmed appointment/integration handoff (primarily `service_requests`). **Workshop operations / Phase 2 product scope** = intake/repair/`service_orders` (roadmap Phase 16) — see data-model terminology |
| **Vercel** | Pending Tadej setup — **not a blocker** for local/backend architecture work |
| **Supabase** | Linked project `avtoservis-selan` (`verxxsjbewmkgoxwqvxo`) |
| **Migrations / app tables** | **None** as part of this documentation task — do not create until Phase 1 approvals complete |

### Architectural contracts (do not duplicate — obey)

| Contract | Document |
|---|---|
| Locked Dashboard V1 UI | [`docs/dashboard-v1-preservation.md`](./dashboard-v1-preservation.md) |
| Data model, auth, RLS, holds, integrations | [`docs/data-model-auth-design-v1.md`](./data-model-auth-design-v1.md) |

---

## Non-negotiable rules

### Rule #1 — Dashboard V1 preservation

Dashboard V1 is the **approved and locked visible baseline**.

Never remove, simplify, replace, materially rename, or redesign existing approved UI without **explicit approval**.

Preserve at minimum: sidebar/navigation, header, workflow/status strip, active service-order/case list, desktop table, mobile cards, period filters, status filters, Termini, Potrebna pozornost, Nedavna aktivnost, manual entry, existing visible Slovenian terminology.

Backend work must be wired **behind** this UI.
If architecture conflicts with visible Dashboard V1: **STOP** before changing UI.

→ Details: [`dashboard-v1-preservation.md`](./dashboard-v1-preservation.md)

### Rule #2 — External systems are integrations

Our application owns **canonical internal records**.

Quibi, MyPlanly, Google Calendar, email/SMS remain **replaceable integrations** — never the primary system of record.

Use internal IDs + integration mappings (`integration_links` when introduced).

→ Details: data-model doc §12 (Integration strategy)

---

## Confirmed Phase 1 business flow (Tadej)

**Inputs** (same canonical process): website form · phone · SMS · (manual entry maps into the same case model)

```text
1.  New inquiry
2.  Verify customer, vehicle, service data
3.  If missing → auto email for completion → data attaches to SAME case
4.  When complete → create/open Quibi estimate/quote draft
5.  Internal human review of price/estimate
6.  Send offer to customer
7.  Customer approves offer
8.  Offer available appointment slots
9.  Temporarily reserve (HOLD) offered slots
10. Customer selects one
11. Release unused holds
12. Confirm selected appointment
13. Write confirmed appointment to Google Calendar
14. Transfer/sync to MyPlanly
15. MyPlanly continues existing SMS/email reminders
```

**Automation:** prepare as much as possible.
**Human gates (mandatory):** estimate/price review · important customer-facing offer confirmation · other sensitive final decisions.

→ Full mapping: data-model doc §2.4

---

## Visible dashboard states (presentation, not one DB enum)

| Visible concept | Backend treatment |
|---|---|
| Novo | Lifecycle on `service_request` |
| Manjkajo podatki | Lifecycle + missing-field metadata |
| Potreben pregled | Later / workshop-oriented (`service_order`); keep UI |
| Priprava ponudbe | Request and/or quote lifecycle |
| Čaka potrditev ponudbe | Offer/approval lifecycle |
| Čaka izbiro termina | Request + offered/held appointments |
| Termin potrjen | Confirmed appointment + request state |
| Zaključeno | **Phase 1 = administrative process complete** — **NOT** vehicle repair finished |
| Potrebna pozornost | Overlay / attention queue — not a normal lifecycle stage |
| Napaka | Overlay / error-attention — not a normal lifecycle stage |

**Do NOT force all of these into one database enum.**
Split across service request, quote, appointment, service order, integrations, and attention state. Dashboard **derives** a simple operational status for the user.

→ Details: data-model doc §7; preservation soft conflicts A–D

---

## Role of AI / automation

**AI/automation may:**

- parse incoming data
- suggest missing fields
- prepare records
- prepare emails
- suggest slots
- surface next actions
- identify operational attention

**AI must not initially:**

- independently approve prices
- independently commit sensitive customer-facing commercial decisions
- override authorization / RLS
- bypass human approval gates

---

## Security gates (every database slice)

Before claiming a DB slice done:

- [ ] RLS enabled
- [ ] positive authorized access
- [ ] unauthorized access denied
- [ ] cross-workshop access denied
- [ ] service role never exposed to browser
- [ ] no secrets in repo
- [ ] validation
- [ ] safe error handling
- [ ] migrations reproducible
- [ ] rollback/recovery understood

Authorization is enforced by **RLS**, not UI route protection alone.

---

## Standard development process (every implementation slice)

1. Confirm clean `main`
2. Confirm `HEAD == origin/main`
3. Create dedicated branch / worktree
4. Inspect existing implementation
5. Implement smallest safe slice
6. Tests
7. lint
8. build
9. `git diff --check`
10. DB/RLS checks if relevant
11. browser QA
12. desktop/mobile QA if UI affected
13. review diff
14. commit
15. push
16. PR / review
17. merge
18. main alignment check
19. production smoke test where applicable
20. cleanup branch / worktree

No unrelated changes. No opportunistic scope expansion.

---

## Vercel / deployment

**Current:** GitHub baseline exists · Vercel deployment pending Tadej.

When Vercel becomes available:

- [ ] Import `as-selan/Avtoservis-Selan`
- [ ] First demo deployment
- [ ] Verify `/` → `/dashboard`
- [ ] Production smoke test
- [ ] Later: public Supabase env vars
- [ ] Configure Auth redirect URLs when auth begins
- [ ] Custom domain later
- [ ] Production plan / commercial hosting reviewed before real business production

**Vercel access is not a blocker** for database architecture or local backend work.

---

# Roadmap phases

## PHASE 0 — Baseline

- [x] Repository created
- [x] Next.js application initialized
- [x] Dashboard V1 implemented
- [x] Desktop QA
- [x] Mobile QA
- [x] Hydration fix
- [x] lint / build / diff-check PASS
- [x] Initial GitHub baseline commit
- [x] `main` aligned with `origin/main`

**Baseline commit:** `7e073f032fc8a195166b82b37b09c6e1946c8a01`

- [ ] First Vercel demo deployment
- [ ] Production smoke test of Vercel deployment

**Note:** Vercel is **not** a blocker for local/backend development.

**Milestone:** M0 — Dashboard baseline ✅

---

## PHASE 1 — Architecture freeze

Documentation and decisions only. **No database writes.**

- [x] Dashboard V1 preservation document created → [`dashboard-v1-preservation.md`](./dashboard-v1-preservation.md)
- [ ] Dashboard V1 preservation document **finalized / approved**
- [x] Data Model & Auth Design V1 drafted → [`data-model-auth-design-v1.md`](./data-model-auth-design-v1.md)
- [ ] Data Model & Auth Design V1 **reviewed**
- [x] Tadej Phase 1 workflow incorporated (in data-model + this plan)
- [ ] Entity boundaries **approved**
- [ ] Status strategy **approved** (split backend + derived dashboard states)
- [ ] Appointment hold design **approved**
- [ ] Integration boundary **approved**
- [ ] Initial role model **approved**
- [ ] RLS model approved **conceptually**
- [ ] Migration sequence **approved**
- [x] Master implementation plan created (this document)
- [ ] Master implementation plan **approved** as roadmap

**Open decisions for this phase** — see [Open questions](#open-questions) below.
**Next:** Approve data-model design → then Phase 2 migrations may begin.

**Milestone:** M1 — Architecture approved (pending)

---

## PHASE 2 — Supabase foundation

**Goal:** Secure multi-user foundation.
**Contract:** data-model §5 (org/profiles/memberships), §8–10 (auth/RLS).

- [ ] Create isolated feature branch / worktree
- [ ] Prepare first migration
- [ ] `organizations` / workshops
- [ ] `profiles`
- [ ] organization memberships
- [ ] roles
- [ ] active / inactive membership
- [ ] common timestamps
- [ ] RLS enabled immediately
- [ ] membership-based SELECT policies
- [ ] membership-based INSERT / UPDATE policies
- [ ] safe delete / archive strategy
- [ ] indexes
- [ ] migration diff review
- [ ] apply **only after explicit approval**
- [ ] verify with Supabase introspection
- [ ] RLS negative tests
- [ ] lint / build
- [ ] commit / PR / review / merge

**Important:** No business table exposed without RLS. Do not rely on UI route protection for authorization. Pass [Security gates](#security-gates-every-database-slice).

**Milestone:** M2 — Secure Supabase foundation

---

## PHASE 3 — Customers + vehicles + service requests

**Goal:** First real business records.
**Contract:** data-model §5.4–5.6.

### Customers

- [ ] customer schema
- [ ] individual / business support
- [ ] name / company name
- [ ] phone
- [ ] email
- [ ] optional address later
- [ ] notes where appropriate
- [ ] duplicate search strategy

### Vehicles

- [ ] vehicle schema
- [ ] customer relationship
- [ ] registration
- [ ] VIN
- [ ] brand
- [ ] model
- [ ] year
- [ ] fuel
- [ ] kW
- [ ] engine / displacement
- [ ] engine code / type
- [ ] current / reference vehicle data

### Historical values

- [ ] do not rely on overwriting mileage only on vehicle
- [ ] mileage captured per visit / request / intake where appropriate

### Service requests

- [ ] canonical `service_request` entity
- [ ] source: web / phone / SMS (and manual)
- [ ] customer FK
- [ ] vehicle FK
- [ ] requested service
- [ ] description
- [ ] data completeness state
- [ ] `next_action`
- [ ] assigned user if needed
- [ ] attention / error information
- [ ] archive strategy

### RLS + verification

- [ ] RLS: customers
- [ ] RLS: vehicles
- [ ] RLS: service_requests
- [ ] positive access tests
- [ ] cross-organization denial tests
- [ ] lint / build
- [ ] browser QA (no UI redesign)

**Milestone:** M3 — Real customer / vehicle / request data

---

## PHASE 4 — Manual entry vertical slice

**FIRST real end-to-end functional slice.**
Preserve existing Manual Entry UI — **do not redesign**.

- [ ] Open existing manual entry
- [ ] search customer by phone / email
- [ ] search vehicle by registration / VIN
- [ ] reuse existing customer / vehicle where possible
- [ ] create customer if needed
- [ ] create vehicle if needed
- [ ] create `service_request`
- [ ] source = phone or SMS / manual
- [ ] request appears immediately on existing dashboard
- [ ] workflow strip updates
- [ ] activity entry generated
- [ ] RLS verified
- [ ] duplicate handling tested

**Acceptance scenario:** Tadej receives a phone call from an existing customer and creates a new request **without duplicating** customer/vehicle data.

**Milestone:** M4 — Manual intake end-to-end

---

## PHASE 5 — Dashboard real data wiring

**Goal:** Replace demo data behind the approved UI. **Do NOT redesign.**

- [ ] replace demo service-request / case data source
- [ ] preserve unified operational list
- [ ] preserve workflow strip
- [ ] derive visible workflow state (mapping/adaptor layer)
- [ ] preserve Termini
- [ ] preserve Potrebna pozornost
- [ ] preserve Nedavna aktivnost
- [ ] preserve filters
- [ ] preserve responsive mobile cards

**Architectural rule:** DB may distinguish `service_request` and `service_order`. Dashboard continues a **unified** operational experience via adaptor — not a UI rewrite.

### Verification

- [ ] desktop 1440
- [ ] mobile 390
- [ ] narrow mobile ~350
- [ ] no hydration mismatch
- [ ] no page overflow
- [ ] empty states
- [ ] loading states
- [ ] error states

*(M4/M5 may interleave; both required before calling “dashboard on real data” done.)*

---

## PHASE 6 — Website intake

**Goal:** Website inquiries enter the **same** canonical workflow.

- [ ] define secure intake endpoint
- [ ] validate submitted data
- [ ] create / reuse customer
- [ ] create / reuse vehicle when safely identifiable
- [ ] create `service_request`
- [ ] source = `web_form`
- [ ] idempotency / duplicate protection
- [ ] abuse / rate-limit considerations
- [ ] success / error handling
- [ ] dashboard visibility
- [ ] activity event

**Important:** Do **not** create a parallel “website inquiries” system. All inputs converge into `service_requests`.

**Milestone (with Phase 7):** M5 — Website intake + missing-data completion

---

## PHASE 7 — Missing data completion

- [ ] completeness rules
- [ ] determine required data
- [ ] mark request “Manjkajo podatki”
- [ ] prepare / send completion email
- [ ] secure completion link / token
- [ ] customer submits missing data
- [ ] attach changes to **same** `service_request`
- [ ] no duplicate case
- [ ] activity history
- [ ] expiry / security controls
- [ ] dashboard state updates automatically
- [ ] human / manual fallback required

---

## PHASE 8 — Quote / Quibi integration

**Do NOT implement until API capabilities are confirmed.**

### Discovery first

- [ ] obtain Quibi API documentation / access
- [ ] confirm create / read / update capabilities
- [ ] confirm estimate / quote identifiers
- [ ] confirm authentication mechanism
- [ ] confirm webhooks / polling possibilities
- [ ] document rate limits / errors

### Then implement

- [ ] integration connection model
- [ ] create Quibi draft after data completeness
- [ ] store integration mapping
- [ ] internal price review gate
- [ ] do **NOT** auto-send unreviewed pricing
- [ ] approve / send offer
- [ ] sync status back to case
- [ ] error / attention handling
- [ ] retry / idempotency
- [ ] audit trail

**Quibi is NOT canonical storage.**

**Milestone (with Phase 9):** M6 — Quote approval workflow

---

## PHASE 9 — Customer offer approval

- [ ] sent status
- [ ] viewed if available
- [ ] approved
- [ ] rejected
- [ ] expired
- [ ] approval timestamp
- [ ] immutable evidence of what was approved where necessary
- [ ] dashboard mapping
- [ ] activity history

After approval → transition to appointment proposal workflow (Phase 10).

---

## PHASE 10 — Appointment availability + temporary holds

**Core Phase 1 requirement.**
**Contract:** data-model §5.8 (holds), §7.2 appointment statuses.

**Note:** Canonical `public.appointments` table + RLS were prepared early as PREP foundation (`20260914003000_appointments_foundation.sql`). Dashboard Termini can read **confirmed** rows in a 14-calendar-day window. This Phase still owns availability, holds, selection, expiry, and concurrency — do not treat the foundation migration as Phase 10 complete.

- [ ] appointment availability model
- [ ] temporary appointment hold entity / state
- [ ] multiple offered slots per request
- [ ] hold expiry
- [ ] prevent double-offering held slots
- [ ] customer selects one
- [ ] selected hold becomes confirmed appointment
- [ ] unused holds released
- [ ] expired holds released
- [ ] concurrency protection
- [ ] transaction / RPC strategy if required
- [ ] idempotent selection
- [ ] cancellation handling
- [ ] rescheduling handling
- [ ] audit history

Clearly distinguish: **availability** · **offered slot** · **temporary hold** · **confirmed appointment**.

**Milestone:** M7 — Appointment holds + selection

---

## PHASE 11 — Google Calendar

Only after appointment selection works **internally**.

- [ ] choose Google Calendar integration strategy
- [ ] OAuth / service-account suitability review
- [ ] create confirmed appointment event
- [ ] update event
- [ ] cancel event
- [ ] external mapping
- [ ] idempotency
- [ ] retry strategy
- [ ] integration failure = attention / Napaka state
- [ ] internal appointment remains canonical

Do **not** make Google Calendar the system of record.

**Milestone (with Phase 12):** M8 — Google / MyPlanly integrations

---

## PHASE 12 — MyPlanly

**Only after API capabilities are confirmed.**

### Discovery first

- [ ] obtain MyPlanly API documentation / access
- [ ] verify read available slots if needed
- [ ] verify create appointment
- [ ] verify modify appointment
- [ ] verify cancel appointment
- [ ] verify reminder behavior
- [ ] verify authentication
- [ ] verify API / webhook limitations

### Then implement

- [ ] sync confirmed appointment
- [ ] preserve mapping
- [ ] sync changes
- [ ] sync cancellation
- [ ] status / retry handling
- [ ] dashboard attention on sync failure

**Goal:** MyPlanly continues existing SMS/email reminders.

---

## PHASE 13 — Activity / audit

Useful traceability — not enterprise overengineering.
**Contract:** data-model `activity_events`.

Track important actions:

- [ ] request created
- [ ] data completion requested
- [ ] data completed
- [ ] quote draft created
- [ ] quote internally approved
- [ ] offer sent
- [ ] customer approved / rejected
- [ ] slots offered
- [ ] slot selected
- [ ] appointment confirmed
- [ ] Google Calendar sync
- [ ] MyPlanly sync
- [ ] errors / retries
- [ ] manual corrections

Each event records where appropriate: organization · entity · action · actor · timestamp · relevant metadata.

*(May be introduced lightly from Phase 4 onward and expanded through Phase 12.)*

---

## PHASE 14 — Auth UX + role enforcement

**Tentative roles:** admin/owner · reception/service advisor · mechanic

**Tadej confirmed — two future configurable mechanic modes (not implemented in M3):**

| Role | Access |
|---|---|
| admin / owner | full operational / admin access |
| reception / advisor | customers, requests, quotes, appointments |
| mechanic | **M3: no automatic access.** Later: (A) restricted — only assigned/necessary jobs, vehicles, related customer data, **or** (B) full workshop access |

Mechanic permission/assignment logic is a dedicated later slice. RLS remains authoritative.

- [ ] login
- [ ] logout
- [ ] reset password
- [ ] session handling
- [ ] protected app routes
- [ ] membership validation
- [ ] role-aware navigation / actions
- [ ] RLS remains authoritative
- [ ] invite employee flow later

Do **not** expose service-role keys in browser code.

---

## PHASE 15 — Phase 1 end-to-end UAT

Controlled test case:

- [ ] website / manual inquiry
- [ ] customer / vehicle resolution
- [ ] missing data
- [ ] completion
- [ ] Quibi draft
- [ ] human quote review
- [ ] offer send
- [ ] customer approval
- [ ] 3 appointment slots
- [ ] temporary holds
- [ ] slot selection
- [ ] unused holds release
- [ ] Google Calendar
- [ ] MyPlanly
- [ ] final Phase 1 dashboard state
- [ ] activity history

### Failure scenarios

- [ ] incomplete request
- [ ] duplicate submission
- [ ] customer rejects offer
- [ ] customer does not respond
- [ ] expired appointment holds
- [ ] simultaneous slot selection
- [ ] Google sync failure
- [ ] MyPlanly sync failure
- [ ] manual recovery
- [ ] cancellation
- [ ] rescheduling

**Phase 1 is NOT complete** until these flows have evidence-backed PASS results.

**Milestone:** M9 — Phase 1 UAT complete

---

## PHASE 16 — Phase 2 workshop operations (LATER)

Explicitly **after** Phase 1 is stable. Do not pull into first migrations unnecessarily.

- [ ] `service_orders`
- [ ] vehicle intake
- [ ] mileage at intake
- [ ] vehicle photos
- [ ] inspection
- [ ] diagnosis
- [ ] findings
- [ ] assigned mechanic
- [ ] work progress
- [ ] additional work
- [ ] additional approval
- [ ] repair photos
- [ ] internal notes
- [ ] customer communication
- [ ] vehicle ready
- [ ] pickup
- [ ] completed repair

**Milestone:** M10 — Workshop / service-order Phase 2

---

## PHASE 17 — Future, out of current scope

List and **explicitly defer** — do not implement opportunistically:

- invoicing
- accounting
- inventory
- procurement
- parts management
- marketing CRM
- complex employee scheduling
- AI extraction / agents (beyond assistive prep above)
- advanced analytics
- fleet / customer portals

---

## Open questions

| # | Question | Status | Blocking? |
|---|---|---|---|
| Q1 | Mechanic permissions: two configurable modes (restricted assigned/necessary vs full workshop) | **CONFIRMED requirement; modes not implemented** | BLOCKING FOR PHASE 14 (role UX / mechanic modes). **Not blocking M3:** mechanic has no automatic access |
| Q2 | Confirm exact meaning of Phase 1 “Zaključeno” (admin journey complete vs other) | **OPEN** (design proposal: admin complete ≠ repair) | BLOCKING FOR PHASE 1 approval / PHASE 5 mapping |
| Q3 | Confirm temporary slot hold duration | **OPEN** | BLOCKING FOR PHASE 10 |
| Q4 | Confirm what happens if customer never responds | **OPEN** | BLOCKING FOR PHASE 9–10 |
| Q5 | Confirm quote expiry behavior | **OPEN** | BLOCKING FOR PHASE 9 |
| Q6 | Confirm whether approved quote can later change | **OPEN** | BLOCKING FOR PHASE 8–9 |
| Q7 | Obtain Quibi API capabilities | **OPEN** | BLOCKING FOR PHASE 8 |
| Q8 | Obtain MyPlanly API capabilities | **OPEN** | BLOCKING FOR PHASE 12 |
| Q9 | Confirm Google Calendar account / calendar ownership | **OPEN** | BLOCKING FOR PHASE 11 |
| Q10 | Confirm email sender / service for automated emails | **OPEN** | BLOCKING FOR PHASE 7 |
| Q11 | Confirm website form integration details | **OPEN** | BLOCKING FOR PHASE 6 |
| Q12 | Entity boundaries / status strategy / holds / RLS / migration order approval | **OPEN** | BLOCKING FOR PHASE 2 |
| Q13 | Conversion timing: when does `service_request` become workshop `service_order`? | **OPEN** | Soft for Phase 1; BLOCKING FOR PHASE 16 |

Update statuses to **CONFIRMED** when decided. Do not start a phase marked BLOCKING until its blockers are resolved or explicitly waived.

---

## Milestones summary

| ID | Milestone | Acceptance condition |
|---|---|---|
| **M0** | Dashboard baseline | Dashboard V1 on `main` @ `7e073f0…`; lint/build/QA evidence; GitHub aligned |
| **M1** | Architecture approved | Preservation + data-model + this roadmap reviewed; entity/status/hold/integration/RLS/migration decisions approved; no migrations yet |
| **M2** | Secure Supabase foundation | Org/profiles/memberships live with RLS; negative access tests PASS; applied only after approval |
| **M3** | Real customer/vehicle/request data | Schemas + RLS; owner/admin/reception create/read/update; mechanic no automatic access; cross-org denied |
| **M4** | Manual intake end-to-end | Phone-call scenario: reuse customer/vehicle, create request, appears on locked dashboard |
| **M5** | Website intake + missing-data completion | Web → same `service_request`; missing-data email; completion attaches to same case |
| **M6** | Quote approval workflow | Quibi draft + human price gate + send + customer approve/reject mapped to dashboard |
| **M7** | Appointment holds + selection | Multi-slot offer, holds, select one, release unused, concurrency-safe confirm |
| **M8** | Google / MyPlanly integrations | Confirmed appointment syncs; failures → attention; internal appointment remains canonical |
| **M9** | Phase 1 UAT complete | Happy path + failure scenarios evidence-backed PASS |
| **M10** | Workshop / service-order Phase 2 | Intake → repair → ready → pickup after Phase 1 stable |

---

## Recommended near-term sequence (after Architecture Freeze)

```text
Approve docs (Phase 1)
  → Phase 2 foundation
  → Phase 3 customers/vehicles/requests
  → Phase 4 manual entry E2E
  → Phase 5 dashboard real-data wiring
  → Phase 6–7 web + missing data
  → Phase 8–9 quotes (after Quibi API)
  → Phase 10 holds
  → Phase 11–12 Calendar / MyPlanly (after APIs)
  → Phase 13–14 harden activity + auth UX
  → Phase 15 UAT
  → only then Phase 16 workshop ops
```

Vercel demo (Phase 0 remaining items) can happen in parallel anytime Tadej grants access.

---

## Document control

| Field | Value |
|---|---|
| Created | 2026-09-12 |
| Purpose | Master implementation roadmap |
| Scope of this change | Documentation only under `docs/` |
| Must not | Change app code, Dashboard V1, migrations, SQL, Supabase data/schema/auth, deploy, commit, push |

**STOP after documentation.** Do not implement migrations until Phase 1 approvals are explicit.
