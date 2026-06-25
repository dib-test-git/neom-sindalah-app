# Sindalah architecture

## Purpose

Sindalah is the luxury-island concierge platform for NEOM. It pairs a **guest mobile
app** with a **staff mobile app**, both backed by a small set of Node.js/TypeScript
services. The platform is the digital surface for the butler service, yacht/spa booking,
folio sync with Opera PMS, and a tamper-evident VIP audit log.

## High-level diagram

```
                                +--------------------------+
                                |    Opera PMS (REST)      |
                                +-----------+--------------+
                                            ^
                                            |
                +--------------+    +-------+--------+    +----------------+
                | Marina API x3 |<--+ opera-integration+--+ Stripe (charges)|
                +-------+------+    +-------+--------+    +----------------+
                        ^                   ^
                        |                   |
                +-------+----+      +-------+-------+
                | marina-    |      | concierge-chat|
                | availability       | (WSS, AR<->EN) |
                +------+-----+      +-------+-------+
                       ^                    ^
                       |                    |
                +------+-------+    +-------+-------+
                | Guest mobile |<-->| Staff mobile  |
                +--------------+    +---------------+
                       ^                    ^
                       |                    |
                       +--------+-----------+
                                |
                          +-----+------+
                          | vip-audit  |
                          | (append    |
                          |  only)     |
                          +------------+
```

## Key flows

### 1. Butler chat (KAN-39)

1. Guest opens the **Butler** tab in `guest-mobile`.
2. Client opens a WebSocket to `concierge-chat` (`wss://api.sindalah/butler`).
3. Threads are stored with a monotonic `seq` per thread; the client reconciles by `seq`,
   not by client-arrival time. See `services/concierge-chat/src/threads.ts`.
4. Inbound guest text is translated AR <-> EN on the fly for the staff agent in
   `staff-mobile` (KAN-43 ties this to the wellness rebook flow).
5. Read receipts flow back over the same WSS.

### 2. Opera folio sync (KAN-40)

1. Reservation events come in from Opera via webhook.
2. `opera-integration` maps Opera reservation IDs to internal guest IDs.
3. Spa / yacht charges are posted **once** using an idempotency key
   `<guestId>:<chargeSurface>:<calendarDayInTZ>`. See `services/opera-integration/src/folio_sync.ts`.
4. Posting failures are retried with exponential backoff; a failed post is replayed only
   if the idempotency key has not been consumed.

### 3. Yacht booking (KAN-41)

1. Guest selects a date / berth class.
2. `marina-availability` fans out to the three marinas (`Sindalah North`, `Sindalah South`,
   `Sindalah West Cove`) and aggregates inventory.
3. Hold + confirm is a 2-phase: a soft hold (TTL 5m) followed by Opera charge posting.

### 4. VIP audit (KAN-42)

Every staff action that touches a VIP record (rate change, comp, room move, charge
adjustment) is written to `vip-audit` as an append-only, hash-chained record. The chain
head is published daily for tamper evidence.

## Non-functional

- **Languages**: AR + EN, RTL-correct in the guest app
- **Compliance**: PII never leaves region; logs are scrubbed by `services/concierge-chat/src/translation.ts`
- **SLOs**:
  - chat p95 message-deliver < 400ms
  - folio post p95 < 1.5s
  - yacht availability p95 < 800ms

## Repos & ownership

See `.github/CODEOWNERS`.
