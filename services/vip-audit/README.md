# vip-audit

Append-only, hash-chained VIP audit log. Implements the spec in
[`docs/vip-handling.md`](../../docs/vip-handling.md). Linked Jira: **KAN-42**.

## Why this is its own service

The VIP audit log is the system-of-record for every staff-side change made
against a VIP guest. It is on the compliance-critical path, so it is:

- Deployed independently from the rest of the platform.
- Backed by a Postgres table with `REVOKE UPDATE, DELETE` on the write role.
- Hash-chained per guest, with the daily chain head published to an immutable
  store for tamper evidence.

## Surface

- `appendEntry(input)` — append a single action. Server-side validates rules
  (e.g. `butler.override` requires `actorRole === 'dge'`).
- `verifyChain(guestId)` — recompute the chain; returns the index of the first
  broken link or -1 if intact.

See `src/audit_log.ts`.

## Reads

Read access is open to all staff; the staff app `VIPAuditScreen` calls
`vipAudit(threadId)` via GraphQL.

## Open items

- [ ] Daily chain-head publication to S3 Object Lock (governance mode).
- [ ] Sign daily chain head with hardware KMS.
- [ ] Backfill historical pre-launch ops actions (one-time, S25).
