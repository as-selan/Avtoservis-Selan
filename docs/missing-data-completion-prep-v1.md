# Missing-data completion PREP V1

**Status:** PREP only — migration is in the repo, **not applied**. No hosted Supabase / Auth / SMTP / Vercel changes. No `service_role`. No commit/push from this slice.

Canonical business flow for this slice:

`POVPRAŠEVANJE` → `needs_data` → secure completion link → customer fills **only missing** data → **SAME** `service_request` is updated → still incomplete: `needs_data` → complete: `preparing_offer` → **STOP**.

| Item | Value |
|---|---|
| Public page | `/dopolnitev` (unauthenticated). Capability arrives as `#token=…`, then the fragment is scrubbed; raw token stays in page memory only |
| Public API | `POST /api/dopolnitev` — same-origin; raw token in `Authorization: Bearer`; server hashes before RPC |
| Issue | Authenticated `issue_service_request_completion_link` — owner/admin/reception only |
| Table | `public.service_request_completion_links` (capability lifecycle **not** a column on `service_requests`) |
| Stored secret | SHA-256 hex of the raw token only — **never** the raw bearer token |
| Default expiry | **7 days** (`COMPLETION_LINK_TTL_MS`); SQL rejects expiries beyond ~7 days |
| Completeness | Same V1 as M4/Phase 6: phone, email, VIN, make, model |
| Complete status | `preparing_offer` + `next_action` = `Pripravi ponudbo za pregled.` |
| Internal UX | Copy-link only: **Ustvari povezavo za dopolnitev** on `needs_data` rows |

## SAME `service_request` invariant

Completion **updates** the linked request. The submit RPC must **never** `INSERT` a second `service_request`. If the request has no vehicle and the submission can safely create one, a **new** `vehicles` row is created under the request’s existing customer and attached to that same request.

## Token lifecycle

1. Staff (owner/admin/reception) generates 32 cryptographically random bytes (`crypto.randomBytes`), encodes **base64url**, hashes with SHA-256, registers the hash via authenticated RPC.
2. The raw token is returned only to that employee as `https://host/dopolnitev#token=<RAW>`. Fragments are not sent in the HTTP request, so they are not normal server route/query logs.
3. The public page reads the fragment into **page memory** (`tokenRef`), then immediately scrubs the URL fragment via `history.replaceState` so the visible address becomes `/dopolnitev`. The raw token is never written to `localStorage` / `sessionStorage`, query string, or path.
4. Generating a new link for the **same** request **revokes** previous still-active links (`revoked_at`). Older URLs become unusable.
5. Expired or revoked or unknown hashes return the **same** generic public failure (no existence oracle).
6. Active (non-completed) links are valid **only while** the linked `service_request.status` remains exactly `needs_data` and `archived_at` is null. If staff advances or closes the request (e.g. `cancelled`, `declined`, `closed`, `converted`, `preparing_offer`, `awaiting_customer_approval`, `appointment_confirmed`), resolve/submit return generic unavailable and do **not** mutate or resurrect the request.
7. When the request becomes complete via this flow, `completed_at` is set. A completed-token retry returns a generic successful completed state and **does not mutate** again.

The capability token **is** the authorization mechanism for the public completion flow (32 random bytes + server-side hash + expiry + revocation).

## Allowed fields and no-overwrite

The customer form may only collect fields that are **currently missing** according to server-authoritative persisted state. The client list of fields is not trusted.

**Customer (linked row only):**

- `NULL`/blank → submitted value: fill
- normalized-equal: no-op
- existing non-null **different**: do not overwrite; set internal attention; public response stays generic
- no customer merge, no org/ownership change, no silent attach of another customer

**Vehicle (linked row, or none yet):**

- VIN / make / model only (no registration in this slice)
- `NULL` → fill when safe; equal → no-op; existing different → do not overwrite; attention if needed
- VIN that already belongs to another org-local vehicle: do not transfer/reassign/merge; do not overwrite; attention; keep incomplete as appropriate
- no vehicle yet + safe data: create a **new** vehicle under the request’s customer; never reuse another customer’s vehicle from VIN/reg

Identity conflict is **not** a system error: set/preserve `attention_needed = true` with reason `Preveri podatke iz dopolnitve spletnega povpraševanja.`. Identity conflict itself does **not** set `has_error`. Completion also does **not** clear an already-existing system `has_error` / `error_reason`. The public caller is not told why.

## Locks

Completion-specific serialization **before** M4/Phase 6 identity locks:

1. token hash `910006`
2. service request `910005`
3. phone `910001` / email `910002` / VIN `910003` when those identifiers are involved
4. customer row lock, then vehicle row lock

Registration (`910004`) is not taken. Re-read authoritative rows after locks. Concurrent submits must not create duplicate requests/vehicles, overwrite canonical values, or transfer ownership.

## Privacy

Public resolve/submit responses expose only `{ ok, completed, missing_fields }` (plus a generic message at the Next.js boundary). They must not include `organization_id`, `service_request_id`, customer/vehicle IDs, existing phone/email/VIN, notes, attention/error reasons, or assigned staff.

Malformed payloads fail generically. Do not leak whether a customer or VIN exists.

## Abuse protection

This PREP does **not** add production rate limiting. Direct `anon` `EXECUTE` of `resolve_service_request_completion` / `submit_service_request_completion` with the publishable key is still possible, same class of launch blocker as Phase 6 website intake. Do not treat the Next.js layer as sufficient abuse protection. Rate limiting (or moving writes behind a protected server boundary) is still required before broad production launch. Phase 6’s website-intake abuse-gate documentation is unchanged.

Included now: exact public allowlist (`/dopolnitev`, `/api/dopolnitev` only), same-origin POST, actual bounded body read (16 KiB), hash-before-RPC, no anon table grants, mechanic excluded.

## Explicitly NOT in Phase 7

- Sending the completion email/SMS (staff copy the link)
- Quibi / offers / quotes / sending an offer / customer offer approval
- Appointment selection, MyPlanly, Google Calendar
- Service orders
- Automatic email/SMS sending

Quibi is **next** after complete → `preparing_offer`, and is **NOT implemented** here.

## Dashboard

No Dashboard V1 redesign. On `needs_data` rows, owner/admin/reception can create a completion link and copy it. Token hashes are not shown in the UI. Mechanics have no table/RPC issuance access.
