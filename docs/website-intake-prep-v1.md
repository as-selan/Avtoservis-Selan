# Website intake PREP V1

**Status:** PREP only — migration is in the repo, **not applied**. No hosted Supabase / Auth / SMTP / Vercel changes.

Public website inquiries enter the **same** canonical workflow as manual intake:

`customer` → `vehicle` (when safely resolvable/creatable) → `service_requests`

There is **no** separate website-inquiries database or dashboard queue.

| Item | Value |
|---|---|
| Public page | `/povprasevanje` (unauthenticated) |
| Server boundary | `POST /api/povprasevanje` (same-origin, no CORS) |
| RPC | `public.create_web_service_request_intake(...)` |
| Organization | resolved internally from slug `avtoservis-selan` — **not** a public argument |
| `service_requests.source` | always `web_form` |
| `service_requests.channel` | always `web` |
| New customer `source` | `web_form` |
| Completeness | same V1 as M4: phone, email, VIN, make, model |
| Idempotency | Replay protection for the **same** `p_client_request_id` via `service_requests.intake_request_id`. Independent submissions without VIN/registration are **not** claimed as general duplicate-prevention. |
| Locks | M4 namespaces/order `910000`–`910004`, then customer row, then vehicle row |
| Mileage | Every request may store `service_requests.mileage_reported_km`. New vehicles may initialize `mileage_latest_km`. Existing vehicle mileage cache is **never** written by public web intake (including NULL-fill). |
| Email | SQL is authoritative (pragmatic `local@domain.suffix`). Next.js validation is not a security boundary against direct anon RPC. |

## What the public caller cannot control

The browser/RPC arguments cannot set: `organization_id`, `source`, `channel`, lifecycle `status`, `missing_fields`, `next_action`, attention/error flags, or `assigned_profile_id`.

Anonymous users cannot search customers/vehicles, enumerate identifiers, or receive internal IDs. Success looks the same whether records were created or safely reused.

No anon `SELECT`/`INSERT`/`UPDATE` grants were added on `organizations`, `customers`, `vehicles`, `service_requests`, or `appointments`. Existing RLS stays. Only `EXECUTE` on the narrow RPC is granted to `anon` and `authenticated`.

The app uses the publishable/anon Supabase client. **No `service_role`.**

## Normalization, reuse, conflicts

Same M4 semantics: email `lower(trim)`, VIN `upper(trim)`, registration match key `upper` + strip separators, conservative phone (no `+386` folding). No fuzzy match, no name dedupe.

Reuse only on unambiguous compatible exact match of an **active** record. No match → create. Unsafe identity (ambiguous, conflicting, archived, or incompatible existing values) is **not** reused, merged, overwritten, or transferred. The submission is quarantined into fresh canonical customer/vehicle rows as needed, the `service_request` is flagged for internal attention, and the caller receives the **same** `{ ok: true }` success as safe reuse/create. Anonymous callers must not learn whether an identifier already exists. Manual M4 intake may remain fail-closed because it is an authenticated internal workflow.

Public website intake **never** adds phone/email to an existing customer. Submitted strong identity must already match the persisted value (or be omitted); otherwise the submission is quarantined into fresh canonical rows for human review. The existing customer row is not updated.

Public website intake **never** adds VIN or registration to an existing vehicle. Missing or different submitted vehicle identity causes quarantine rather than mutating the existing record. Descriptive fields (make, model, year, power_kw, engine, engine_type, fuel) may still NULL-fill only on a safely reused vehicle.

Public website intake **never** advances or NULL-fills an existing vehicle mileage cache. Reported mileage belongs on `service_requests.mileage_reported_km`. Only a **new** vehicle may initialize its mileage cache from the submission.

If a submitted VIN already belongs to a vehicle that cannot be safely reused, it is **not** written to the new `vehicles.vin` column (org-unique). It is preserved only on the **new** fallback vehicle `notes` as unverified website intake data (e.g. `Nepotrjen VIN iz spletnega povpraševanja: <VIN>`). Existing vehicle notes are not altered.

## Abuse protection included now

- Hidden honeypot (`companyWebsite`); filled honeypot returns the public success message without writing
- **Actual 16 KiB bounded request-body read** (UTF-8 bytes from the stream). `Content-Length` is a fast reject; missing/chunked bodies are counted while reading and cancelled as soon as the budget is exceeded. `parseWebIntakeBody` also checks UTF-8 byte size. Max string lengths still apply in SQL.
- Same-origin POST only (no wildcard CORS)
- Client double-submit disabled; stable UUID rotated only after success
- Validation at the Next.js boundary **and** in the RPC (RPC remains authoritative for direct publishable-key calls, including email shape)
- Public errors sanitized (no UUIDs, no match metadata, no raw DB/Supabase errors)

## Production launch blocker

A rate limit or Turnstile **only** on `POST /api/povprasevanje` is **not** sufficient: `anon` can still `EXECUTE` `public.create_web_service_request_intake` directly with the publishable key.

Before production launch, choose a control that **cannot be bypassed** by skipping Next.js, for example:

- **A)** revoke direct `anon` RPC execute and move the database write behind a protected server/edge boundary, **or**
- **B)** enforce an abuse/challenge/rate-limit control at the RPC / database-access boundary itself.

Do **not** implement that infrastructure in this PREP slice. No `service_role` here. This remains a production launch blocker.

This slice is also **not** production-grade rate limiting. Once the real production domain/infrastructure is known, implement A or B (optionally with Turnstile on the public form as extra defense-in-depth).

Direct `anon` RPC execute is currently possible with the publishable key; the Next.js layer is additional, not a secret.

## Deferred

- **Phase 7** missing-data completion email / secure token — not implemented. Incomplete requests stay `needs_data` (`Manjkajo podatki` on the existing dashboard).
- **Activity event** — no canonical `activity_events` persistence model exists yet; not invented here. Roadmap activity item remains deferred.
- Quibi, MyPlanly, Google Calendar, offers, appointments/holds — later dedicated phases.

## Dashboard

No Dashboard V1 redesign. Created `service_requests` appear through the existing Phase 5 loader. Complete → **Novo**. Incomplete → **Manjkajo podatki**.
