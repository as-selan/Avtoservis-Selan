# Avtoservis Selan–Quibi: integration design

Status: approved staged, fail-closed approach; no production or PR merge.

## Implemented V1 read workflow

The customer detail page links to `/dashboard/stranke/{customerId}/quibi`. Authorized owner/admin/reception users can search existing Quibi customers by ID, name, phone, or email, compare the displayed details, and explicitly confirm one match. `integration_links` stores only the two IDs, confirmation metadata, and local/remote SHA-256 fingerprints. Unique constraints prevent either ID from being linked twice within the workshop. The page re-reads the linked customer and shows local changes, remote changes, current field differences, read errors, work-order IDs, and estimate IDs. It does not import customers or write to Quibi.

The server adapter is locked to `https://dev.quibi.net` and to four documented read operations: `GET /api2/stranka`, `GET /api2/stranka/view/{id}`, `POST /api2/dn`, and `POST /api2/predracuni`. The two POST operations list documents with `{"Filtriraj":{}}`; they do not create documents. It validates IDs and response envelopes, times out after eight seconds, retries transport failures once, and filters document lists by the confirmed customer ID. API failures display a generic warning without leaking credentials or upstream response content.

To run locally, import the existing encrypted `PSCredential` from `$env:APPDATA\Quibi\dev.xml` under the Windows account that created it. Set `QUIBI_DEV_USERNAME` and `QUIBI_DEV_PASSWORD` only in that local process before starting Next.js, then clear them after use. Do not put them in `.env`, Git, CI, or browser code. Production has no Quibi configuration in this V1.

The migration is prepared in Git only; it must be applied to an isolated test database and checked for RLS, uniqueness, and rollback before any deployment. Until then the UI reports unavailable integration links rather than creating an alternate store.

## Scope and authority

Avtoservis Selan owns customer, vehicle, service-request, offer-preparation, review, and approval state. Quibi owns its customer, vehicle, and estimate records. Store only mapping IDs, sync fingerprints, attempt state, and operational alerts in Selan. Never create a second local Quibi customer or vehicle ledger.

The application must keep the existing owner/admin/reception access gate. Mechanic and anonymous callers cannot trigger sync. Quibi credentials remain server-only and must never appear in logs, URLs, browser bundles, or Git.

## Verified API surface

Official source: https://navodila.quibi.net/za-razvijalce/

| Operation | Documented API | Safe planned use |
| --- | --- | --- |
| Customer list/detail | GET /api2/stranka, GET /api2/stranka/view/{id} | Reconcile an existing mapping and detect remote changes. |
| Customer create/update | POST /api2/stranka/form, POST /api2/stranka/form/{id} | Send explicit customer fields, including Selan UUID as remote_id; update only a known, verified mapping. |
| Vehicle create | POST /api2/vozila/form | Use only after customer mapping exists and registration is present; require a real returned Quibi ID. |
| Numberings | GET /api2/stevilcenje?glavadokumenta=1 | Discover a real estimate numbering ID; never invent one. |
| Estimate list/detail | POST /api2/predracuni, GET /api2/glavadokumenta/view/{id} | Reconcile a known document ID. |
| Document create | POST /api2/glavadokumenta/form | Use only with a verified customer ID, a confirmed estimate numbering ID, and actual Quibi item data. |

The public documentation does not specify vehicle read/update, exact response ID fields, a document idempotency key, or a sandbox contract. The document API can create a customer if an ID is absent, so every document request must carry the verified Quibi customer ID. No automatic retry follows an ambiguous create response until reconciliation proves whether the external record exists.

### Test-account read verification (2026-09-26)

Using an imported local `PSCredential`, read-only calls to `https://dev.quibi.net` succeeded. No create or update call was made. The response envelope has `error`, `message`, and `data` fields; every checked response had `error: false`.

| Endpoint | Observed shape and count | Example actual ID |
| --- | --- | --- |
| `GET /api2/stranka` | `data.Stranke[]`, each with `Stranka.id`; 1,132 records | customer `13510` |
| `GET /api2/stranka/view/13510` | `data.Stranke.Stranka.id` | customer `13510` |
| `POST /api2/dn` with `{"Filtriraj":{}}` | `data.Dokumenti[].Glavadokumenta.id`; 252 records | work order `2161079`, customer `324127` |
| `POST /api2/predracuni` with `{"Filtriraj":{}}` | `data.Dokumenti[].Glavadokumenta.id`; 261 records | estimate `2160142`, customer `372844`, numbering `2061` |
| `GET /api2/glavadokumenta/view/{id}` | `data.Dokumenti.Glavadokumenta.id` for both sampled document types | work order `2161079`, estimate `2160142` |
| `GET /api2/stevilcenje?glavadokumenta=1` | `data.Stevilcenje[]`; 12 records | estimate references numbering `2061` |

The observed detail IDs match their respective list IDs. None of the 1,132 customer list records had a populated `Stranka.remote_id`. Therefore `remote_id` cannot be used to identify existing Selan-linked customers in this account, and customer matching requires explicit operator review before a link is persisted. List counts and example IDs describe only this test account at the verification time.

## State and retry

Each link is unique by tenant/provider/entity and by tenant/provider/external ID. Its fingerprint records the exact canonical fields confirmed remotely. A changed canonical fingerprint marks the mapping stale; an unchanged one is a no-op. A confirmed remote mismatch creates an attention item instead of silently overwriting either side.

Retry transport failures with bounded exponential delay only for safe reads and known-ID updates. For create calls, persist an in-flight attempt before the network request; after a timeout or unknown response, mark it uncertain and require reconciliation before another write. Return actionable, non-sensitive error codes to the UI. Preserve full request and response details only in redacted server diagnostics.

## First executable slice

1. Prepare a separate integration branch from PR #14's head, then incorporate the tested M3/M4 branch without modifying either source branch. Resolve overlapping test files by retaining the latest green M3/M4 tests. Run all stacked assertions, lint, build, and isolated DB suites before proposing any merge.
2. Add the smallest tenant-scoped integration-link and attempt model with RLS/privilege tests. It stores IDs and fingerprints, not duplicated customer, vehicle, or quote details.
3. Add a server-only Quibi client for the documented endpoints with strict URL allowlisting, explicit credentials, response validation, timeouts, and redacted errors. Contract tests use recorded anonymous fixtures; unknown ID response shapes fail closed.
4. Add customer reconciliation and sync first. Vehicle creation is gated on registration and a verified customer mapping. Stop with an alert when vehicle read/update is needed but undocumented.
5. Prepare estimate creation from an eligible Phase 8 offer and real Quibi numbering/items. Never synthesize prices, item IDs, Quibi IDs, approvals, or delivery. Creation remains disabled until response shape, document deduplication/reconciliation, and test-account behavior are confirmed.

## Merge gates

The PR chain is #3 → #4 → #5 → #6 → #7 → #8 → #9 → #10 → #11 → #12 → #13 → #14. The green M3/M4 test branch diverges from PR #4 and must be incorporated before the later stack is accepted. PR #7's public intake additionally needs durable abuse protection before production exposure. Every migration after M4 is currently PREP and requires an isolated application/rollback review. No PR merge, hosted migration, credential installation, or production Quibi call is part of this preparation.

## Open contracts

- Customer and document list/detail ID locations are confirmed for read responses. Create response ID locations remain unverified; no write was attempted.
- Quibi must confirm vehicle lookup/update and whether registration-free vehicles are supported.
- Quibi must confirm a safe document deduplication or reconciliation key and whether a draft can be created without priced line items.
- A real estimate numbering and item catalog must be selected from the target Quibi account before estimate creation can run.
