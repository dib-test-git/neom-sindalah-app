# Opera PMS — integration contract

> Status: In Review (KAN-40). Owner: @neom-sindalah-leads.
> Sandbox: `https://opera-sandbox.neom.internal`
> Production: `https://opera.sindalah.neom.com` (no public DNS)

## Scope

`services/opera-integration` is the **only** service that talks to Opera. All other
services that need reservation, profile or folio data must go through its GraphQL
facade — direct Opera access is forbidden.

## Endpoints we consume

| Method | Path                                              | Used for                          |
|--------|---------------------------------------------------|-----------------------------------|
| GET    | `/rsv/v1/reservations/{id}`                       | Reservation read                  |
| PATCH  | `/rsv/v1/reservations/{id}`                       | Update reservation                |
| GET    | `/rsv/v1/reservations/{id}/folio`                 | Folio read                        |
| POST   | `/rsv/v1/reservations/{id}/folio/charges`         | **Post a charge to the folio**    |
| GET    | `/rsv/v1/profiles/{id}`                           | Guest profile (VIP tier, prefs)   |
| GET    | `/rsv/v1/availability?date=...&type=...`          | Inventory                         |

## Idempotency

Folio charges are posted with an explicit idempotency key in the
`X-Opera-Idempotency-Key` header. Opera de-duplicates server-side for **24 hours**.

Our key format:

```
sindalah:<reservationId>:<surface>:<localDate>:<sha1(items[])>
```

where:

- `surface` is `spa | yacht | butler | wellness | minibar | f&b`
- `localDate` is the `YYYY-MM-DD` in `Asia/Riyadh`
- `sha1(items[])` is over the canonicalised line-item array

> See KAN-56 — without `localDate + surface` in the key, a guest who books spa **and**
> yacht on the same day gets charged twice for the same composite cart.

## Webhooks Opera sends us

| Event                          | We do                                              |
|--------------------------------|----------------------------------------------------|
| `reservation.created`          | Pin VIP status, prepare profile in our DB          |
| `reservation.checkedin`        | Open butler chat thread (KAN-39)                   |
| `reservation.checkedout`       | Close butler thread, finalise folio mirror        |
| `folio.charge.posted`          | Reconcile local pending charges                    |
| `folio.charge.reversed`        | Reverse any internal accruals                      |

Webhook endpoint: `POST /webhooks/opera` (HMAC-SHA256, secret in
`OPERA_WEBHOOK_SECRET`).

## Auth

OAuth 2.0 client credentials. Token TTL 60m; we cache to 50m and refresh proactively.

## Rate limits

- 600 req/min per client (Opera-enforced)
- Folio post: 60 req/min — we use a token bucket in `folio_sync.ts`

## Error model

Opera returns RFC 7807 `application/problem+json`. We map:

| Opera `type`                                  | Internal class                   |
|-----------------------------------------------|----------------------------------|
| `…/idempotency-key-replayed`                  | `OperaDuplicateChargeError`      |
| `…/reservation-not-found`                     | `OperaNotFoundError`             |
| `…/folio-locked`                              | `OperaFolioLockedError` (retry)  |
| `…/rate-limited`                              | `OperaRateLimitedError` (retry)  |

## Open items

- [ ] KAN-40 — fold idempotency-key derivation into a shared util
- [ ] KAN-56 — close the same-day double-charge gap (fix in flight: `fix/folio-idempotency`)
