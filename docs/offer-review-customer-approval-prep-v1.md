# Offer review + customer approval PREP V1

**Status:** PREP only — migration is in the repo, **not applied**. No hosted Supabase / Auth / Vercel changes. No `service_role`. No commit/push from this slice.

**This phase is PREP ONLY.** There is **no live Quibi API**, **no Quibi credentials**, and **no confirmed Quibi API documentation**. MyPlanly, Google Calendar, appointments, slots, and holds are **not** in scope.

Canonical business flow (this slice stops at foundations; executable success paths remain fail-closed):

```text
POVPRAŠEVANJE
→ DOPOLNITEV PODATKOV
→ PRIPRAVA PONUDBE                 ← Phase 8
→ REAL OFFER VERSION EVIDENCE      ← future evidence writer (not invented here)
→ TADEJEV PREGLED / POTRDITEV      ← Phase 9 contracts (fail closed without evidence)
→ REAL DELIVERY TO CUSTOMER        ← Phase 9 contract (fail closed; no transport yet)
→ POTRDITEV STRANKE                ← modeled; no request-status transition yet
→ ŠELE NATO TERMIN                 ← Phase 10
→ MYPLANLY
```

| Item | Value |
|---|---|
| Tables | `public.quotes`, `public.customer_approvals` |
| RPCs | `approve_quote_for_send`, `reject_quote_for_revision`, `deliver_approved_quote_to_customer` |
| Quote ownership | `organization_id` + `service_request_id` + `offer_preparation_id` — **NOT** `service_order_id` |
| Staff roles | owner / admin / reception |
| Mechanic | excluded |
| Advisory lock | **`910008`** on `(org, service_request_id)` |
| Activity history | **Deferred** — no `activity_events` model yet; do not invent a one-off audit subsystem |

## Phase 1 clarification (quote ownership)

For Phase 1 pre-appointment workflow the offer exists **before** any workshop `service_order`. The long-term ER sketch `service_orders → quotes` is **not** authoritative for this slice. Phase 9 quotes are canonically associated with:

1. `organization_id`
2. `service_request_id`
3. `offer_preparation_id` (Phase 8 readiness row)

**Exact relational binding (DB-enforced):** Phase 9 adds candidate key `offer_preparations_org_request_id_unique (organization_id, service_request_id, id)` without editing the Phase 8 migration. Quotes use composite FK `quotes_prep_same_request_fk` on `(organization_id, service_request_id, offer_preparation_id)` so a quote cannot point at request A while referencing a prep that belongs to request B. Separate org-only FKs are insufficient. Do **not** require `service_order_id`.

## Separation from Phase 8

`public.offer_preparations` remains Phase 8 preparation state only (`ready_for_provider`). Phase 9 **must not** overload it with review, send, or customer-decision statuses.

## Immutable version evidence

Each material offer version is its own `quotes` row:

- `version_no` unique per `(organization_id, service_request_id)`
- `content_sha256` fingerprints the exact evidence
- `evidence_kind` + `evidence_payload` store provider-neutral evidence
- Trigger `quotes_prevent_evidence_mutation` blocks silent mutation of evidence / identity fields
- Changing offer content requires a **new version row**, not an update of a reviewed version
- Tadej approval and customer delivery/decision bind to that exact `quote_id` + `content_sha256`

**Do not invent commercial contents.** No fabricated price, labour, parts, VAT, provider IDs, URLs, document IDs, or Quibi payloads.

**No fabricate-to-continue path:** this PREP migration does **not** provide an INSERT RPC for `quotes`. Normal application code cannot create a quote row merely to make the workflow continue. Approve/reject/deliver therefore fail closed with `not_found` (or related codes) until a future real evidence writer exists.

## Internal review state machine

```text
unreviewed
  → approved_for_send     (exact version + matching content_sha256)
  → rejected_for_revision (exact version + matching content_sha256)
```

`approved_for_send` is allowed **only** for an existing immutable quote version while:

- request is locked `preparing_offer` and not archived
- linked `offer_preparations.status = ready_for_provider`
- hash matches
- version is not superseded by a newer version (`stale_version`)

**Stale-version fail-closed:** both `approve_quote_for_send` and `reject_quote_for_revision` run the newer-version check **before** any idempotent success return. A previously approved (or rejected) older version must still return `stale_version` once superseded — never misleading idempotent success.

Approval does **not** change `service_requests.status` and does **not** mean the customer was contacted.

## Delivery semantics

```text
not_delivered → delivered
```

`service_requests.status` may become `awaiting_customer_approval` **only** after a canonical **real** successful delivery, and that status means: **real delivered offer, still awaiting an active customer decision**. A staff click alone is not delivery.

No email/provider delivery transport exists now. `deliver_approved_quote_to_customer`:

- validates approve-for-send / hash / stale version
- requires the request to still be in authoritative Phase 9 state `preparing_offer` before returning the PREP `delivery_unavailable` contract (cancelled/closed/later → `not_preparing_offer`, not a false delivery candidate)
- **always** returns `delivery_unavailable` when otherwise eligible in this PREP
- does **not** fabricate `delivered_at`, channel, or provider responses
- does **not** set `awaiting_customer_approval`

## Customer decision foundation

```text
delivered → approved | rejected | expired
```

Modeled on `customer_approvals` with:

- composite FK `customer_approvals_quote_version_fk` on the exact tuple `(organization_id, service_request_id, quote_id, content_sha256)` referencing `quotes_org_request_id_hash_unique` — impossible to store request A + quote from request B, or correct `quote_id` + wrong `content_sha256`
- `viewed_at` nullable — **unsupported / any mutation blocked** in this PREP (future view-signal migration may replace that rule deliberately)
- decision requires prior delivery (table check)

**Immutability after canonical delivery / decision** (`prevent_customer_approval_evidence_mutation`):

- once `delivery_status = delivered`: `delivery_status`, `delivered_at`, and `delivery_channel` cannot change
- once `customer_decision` is non-null: `customer_decision` and `decided_at` cannot change
- `token_hash` / `revoked_at` / `expires_at` remain available for future lifecycle (not frozen without reason)

**STOP before changing request status after customer approval.**
Neither keeping a false “Čaka potrditev ponudbe” label after approval nor flipping to `awaiting_slot_selection` before Phase 10 offers slots is acceptable. Phase 10 owns the canonical post-approval scheduling transition. This PREP does not implement a successful customer-decision → `service_requests.status` transition.

### DB status transition guards (Phase 9)

M3 advisor+ may UPDATE `service_requests.status` directly, so RPC avoidance alone is insufficient. Trigger `service_requests_guard_phase9_status_transition` / `guard_phase9_service_request_status_transition`:

- allows updates where `status` itself is unchanged
- **entering** `awaiting_customer_approval` is allowed only when `OLD.status = preparing_offer` and canonical evidence exists: matching `customer_approvals` for that org/request with `delivery_status = delivered`, `customer_decision IS NULL`, `revoked_at IS NULL`, and bound quote with `internal_review_status = approved_for_send` (hash binding enforced by FK). Therefore cancelled/closed/any non-`preparing_offer` source, already-decided approvals, and revoked delivery evidence all fail. Phase 9 has no delivery writer, so this transition is correctly impossible through normal/direct client updates — do not fabricate delivery to satisfy the guard
- **entering** `awaiting_slot_selection` is blocked as the Phase 9 STOP boundary; Phase 10 may replace/extend this smallest safe guard

Forbidden:

- decision before delivery
- delivery before Tadej `approved_for_send`
- Tadej approval without immutable quote evidence
- mutation of approved evidence
- cross-version approval reuse
- stale-version send after a newer version supersedes it
- direct client status flip to `awaiting_customer_approval` without preparing_offer + active delivered evidence
- premature `awaiting_slot_selection` before Phase 10
## Dashboard

Dashboard V1 structure is unchanged. Phase 8 UI remains truthful:

- **Pripravi ponudbo**
- after prep: **Podatki za ponudbo so pripravljeni.**
- **Povezava s Quibijem še ni nastavljena.**

Phase 9 PREP does **not** add a normal clickable “Potrdi in pošlji” / “Pošlji stranki” success path. Do not imply an offer exists, was reviewed, approved, or sent unless those facts exist canonically.

## Locks / security

- Advisory lock **`910008`** then `FOR UPDATE` on the request, then quote row locks
- Does **not** take `910001`–`910007` (no lock-order inversion with intake/completion/prep)
- Org via `private.resolve_manual_intake_org()` (owner/admin/reception)
- RLS select-only for advisor+; no client INSERT/UPDATE/DELETE
- `SECURITY DEFINER` RPCs with `SET search_path = ''`
- Explicit revoke/grant; no anon staff mutation; no `service_role` workflow
- Errors return generic codes only (no PII)

## Explicitly NOT in Phase 9 PREP

- Live Quibi HTTP / executing `OfferDraftProvider`
- Fabricating quote rows / commercial fields / provider IDs
- Successful delivery / `awaiting_customer_approval` transition
- Customer approval → request status transition
- `viewed` synthesis
- `activity_events` / one-off audit history
- Appointments, holds, slots, MyPlanly, Google Calendar
- `quote_items`
