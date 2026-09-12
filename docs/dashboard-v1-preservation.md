# Dashboard V1 Preservation

Dashboard V1 is an approved and locked visible baseline.

Existing UI must not be removed, simplified, replaced, materially renamed, or redesigned without explicit approval.

This includes at minimum:

- sidebar/navigation
- header
- workflow/status strip
- active service-order table
- mobile service-order cards
- period/status filters
- Termini panel
- Potrebna pozornost panel
- Nedavna aktivnost panel
- manual-entry functionality
- existing visible Slovenian terminology

Future backend/data-model work must be wired behind this visible structure **additively**.

Replacing demo data with real data is allowed.

Removing or simplifying approved UI is not.

If database/domain architecture conflicts with the current UI:

**STOP** and report the conflict before changing the UI.

---

## Known soft conflicts

These are expected tensions between domain/backend design and Dashboard V1. They must be resolved by **mapping behind the UI**, not by changing the approved UI.

### A. `service_request` vs `service_order`

The database may separate these entities while Dashboard V1 currently presents one unified operational list.

**Preserve** the unified dashboard experience and map entities behind it.

### B. Split backend statuses

Request, appointment, quote, and service-order statuses may be separate in the database.

**Preserve** the current Slovenian visible workflow concepts and derive/map them from backend state rather than forcing one giant DB enum.

### C. Manual entry

Current UI wording/flow must not be changed without approval even if the backend initially creates a `service_request` instead of a final `service_order`.

### D. Attention / error state

“Potrebna pozornost” / error indicators may become derived operational flags rather than lifecycle statuses.

This must not remove the existing visible dashboard concept.

---

## Related documents

- Data model & auth design (subordinate to this contract): [`docs/data-model-auth-design-v1.md`](./data-model-auth-design-v1.md)
