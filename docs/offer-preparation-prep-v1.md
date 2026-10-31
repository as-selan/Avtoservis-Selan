# Offer preparation PREP V1

**Status:** PREP only — migration is in the repo, **not applied**. No hosted Supabase / Auth / Vercel changes. No `service_role`. No commit/push from this slice.

**This phase is PREP ONLY.** There is **no live Quibi API**, **no Quibi credentials**, and **no confirmed Quibi API documentation**. MyPlanly is **not** in scope.

Canonical business flow (this slice stops at internal prep):

```text
POVPRAŠEVANJE
→ DOPOLNITEV PODATKOV
→ PRIPRAVA PONUDBE          ← this PREP
→ QUIBI DRAFT               ← later, after real API docs/access
→ TADEJEV PREGLED / POTRDITEV CENE   ← Phase 9
→ POŠILJANJE STRANKI        ← Phase 9
→ POTRDITEV STRANKE         ← Phase 9
→ ŠELE NATO TERMIN
→ MYPLANLY
```

| Item | Value |
|---|---|
| Table | `public.offer_preparations` |
| RPC | `public.prepare_service_request_offer(p_service_request_id)` |
| Eligibility | locked `preparing_offer` **and** request `archived_at IS NULL` **and** locked same-org canonical customer/vehicle (`archived_at IS NULL`) **and** canonical V1 completeness (phone, email, VIN, make, model). `preparing_offer` is necessary but not sufficient. |
| Preparation status | `ready_for_provider` only |
| `service_requests.status` | **stays** `preparing_offer` |
| Staff roles | owner / admin / reception |
| Mechanic | excluded |
| Provider | `OfferDraftProvider` — prepared future boundary; **not executed** in Phase 8 |

## Model

One canonical row per `(organization_id, service_request_id)`. This table is the **authoritative Phase 8 preparation state**. Repeated or concurrent prepare actions return that same row (`UNIQUE` + advisory lock `910007`). No duplicate active rows.

`service_requests.next_action` may be set to `Podatki za ponudbo so pripravljeni.` as **human dashboard copy only**. Do not treat that string as business state; dashboard readiness is `offer_preparations.status = 'ready_for_provider'`.

`prepared_at` is set when the internal row is first inserted (when staff data is treated as ready for a later provider). There is no `sent`, `customer_approved`, appointment, invoicing, or workshop state on this table.

## Eligibility

The RPC re-checks after locking the `service_request` (`910007` + `FOR UPDATE`), then locking the linked canonical **customer then vehicle** rows (`FOR SHARE`) for the completeness check:

1. `status = 'preparing_offer'`
2. request `archived_at IS NULL`
3. both `customer_id` and `vehicle_id` resolve to same-org rows
4. those canonical rows are not archived (`customers.archived_at` / `vehicles.archived_at` must be NULL)
5. canonical V1 completeness still holds on persisted fields: **phone + email + VIN + make + model** via `private.compute_intake_completeness` (same helper as intake/completion). No new Quibi-required fields.

If canonical data is incomplete (missing customer/vehicle, archived canonical customer/vehicle, or any required field): `error_code = 'incomplete_data'`, **no** `offer_preparations` insert, **no** `next_action`/`status` change, **no** customer/vehicle mutation, **no** missing values/PII in the result. Phase 8 does **not** move the request back to `needs_data` — fail closed only. Archived canonical customer/vehicle cannot become provider-ready.

Quibi IDs are **not** stored on `service_requests`, `customers`, or `vehicles`.

## Provider-neutral boundary

`OfferDraftProvider` (`createDraft` / `getDraft` / `updateDraft`) is a **prepared future boundary**. Phase 8 **does not execute** it: `prepareOfferAction` and **Pripravi ponudbo** only create/reuse the internal `offer_preparations` row.

Until a later slice with confirmed Quibi API docs/access, the unconfigured adapter **fails closed** with internal code `NOT_CONFIGURED` (or `PROVIDER_UNAVAILABLE` if a later adapter cannot reach a configured provider). That adapter is asserted independently; it is **not** called from the Phase 8 dashboard action.

Real provider execution must revalidate the authoritative locked request **immediately before** any external side effect.

User-facing copy (shown after internal prep, without implying a draft was created):

`Povezava s Quibijem še ni nastavljena.`

No HTTP base URL, endpoint paths, credentials, fake env vars, fake request/response schema, `fetch`/`axios` to Quibi, or fabricated Quibi resource IDs.

A real Quibi adapter **awaits confirmed API documentation and access**.

## `integration_links` (not created here)

The long-term mapping remains the existing design (`organization_id`, provider, internal entity, external resource). This PREP does **not** insert `integration_links` rows and does **not** fabricate `external_resource_id`. Introduce that table when a real provider ID exists.

## Canonical input

Draft input is derived from existing `service_request` + `customer` + `vehicle` fields only (summary, problem_description, service_wanted, brings_own_material, mileage_reported_km, operational customer display/contact, vehicle make/model/year, registration/VIN). No invented prices, labour hours, parts, VAT, discounts, or line-item IDs.

## Dashboard

Dashboard V1 is unchanged structurally. On `preparing_offer` / `priprava_ponudbe` rows:

- Action: **Pripravi ponudbo**
- After internal preparation: **Podatki za ponudbo so pripravljeni.**
- Provider unconfigured: **Povezava s Quibijem še ni nastavljena.**

Readiness on reload comes from loading `offer_preparations` (`status = 'ready_for_provider'`), not from matching `next_action` text. Query failure fails the dashboard snapshot (generic error); it must not pretend there are no preparations.

Do not claim a Quibi draft was created, an offer was sent, or a price/customer was approved.

## Explicitly NOT in Phase 8

- Live Quibi HTTP / executing `OfferDraftProvider` from Phase 8 UI
- Tadej price review / send to customer / `awaiting_customer_approval` (Phase 9)
- Customer offer approval
- Appointments, holds, slots, MyPlanly, Google Calendar
- Quotes table, `integration_links` rows, `service_role`

## Locks

Offer-prep serialization uses advisory lock **`910007`** on `(org, service_request_id)`, then `FOR UPDATE` on that request, then `FOR SHARE` on the canonical **customer** row, then `FOR SHARE` on the canonical **vehicle** row (customer-before-vehicle). Those row locks hold through completeness and `offer_preparations` INSERT/reuse so concurrent owner/admin/reception updates cannot change required fields after the read. Identity locks `910001`–`910006` are **not** taken (no customer/vehicle identity mutation; no lock-order inversion with intake/completion).
