# VIP handling — spec notes

> Status: draft, owners @neom-sindalah-leads. Linked Jira: KAN-42, KAN-22.

## Definition

A **VIP guest** at Sindalah is any guest with one or more of:

- `vipTier` in `{ "Royal", "Diamond", "Platinum" }` on the Opera profile
- `flag.head-of-state == true`
- An active manual elevation by the on-duty Director of Guest Experience (DGE)

VIP status is **evaluated at folio creation time** and pinned on the reservation; it does
not change retroactively when a guest is promoted mid-stay.

## Why this needs its own audit trail

Standard service actions (rate change, comp, room move, charge adjustment, butler
override) for VIPs must be **fully traceable** for both:

1. Internal Operations review (weekly DGE huddle).
2. Compliance audit (annual; KSA hospitality regulator).

The audit trail must be:

- **append-only** — no updates, no deletes
- **tamper-evident** — each entry chained by hash to the previous
- **complete** — every staff action on a VIP record produces exactly one entry
- **fast to read** — queue triage in `staff-mobile` needs the last 50 actions in < 200ms

See `services/vip-audit/src/audit_log.ts` for the implementation skeleton.

## Audit event shape

```ts
type VipAuditEvent = {
  // identity
  id: string;            // ulid
  prevHash: string;      // sha256 hex of previous entry's full payload
  hash: string;          // sha256 hex of (prevHash || canonicalJSON(payload))
  // who / what
  actorStaffId: string;
  actorRole: 'butler' | 'concierge' | 'manager' | 'dge' | 'system';
  guestId: string;
  reservationId: string;
  vipTier: string;
  // event
  action:
    | 'rate.change'
    | 'comp.add'
    | 'room.move'
    | 'folio.adjust'
    | 'butler.override'
    | 'spa.complimentary'
    | 'yacht.complimentary';
  before: unknown;
  after: unknown;
  reason: string;        // required, free-text, max 500
  // when
  occurredAt: string;    // ISO-8601 in Asia/Riyadh
  recordedAt: string;
};
```

## Staff app surfaces (KAN-42)

In `staff-mobile`, the VIP audit log shows:

1. **Per-guest timeline** — `VIPAuditScreen` on tap from the queue.
2. **Action composer** — every VIP action must capture a `reason` before submit.
3. **Tamper banner** — if `vip-audit` reports a chain break, all VIP screens display a
   red banner and disable any new VIP action until ops resolves it.

## Read access

- All staff can read.
- Only `dge` can write `comp.add` > SAR 50,000 (enforced server-side).
- Only `dge` can write `butler.override`.

## Open questions

- Should we mirror the audit log to S3 (Object Lock, governance mode)? Probably yes for
  compliance, but adds replication latency.
- Daily chain-head publication: do we sign with a hardware KMS key? (KAN-42 follow-up.)
