# Sindalah — Luxury Island Concierge & Reservations

> Premium guest concierge platform for Sindalah, NEOM's luxury island destination.
> Butler chat, Opera PMS folio sync, multi-marina yacht booking, wellness reservations,
> VIP audit trail.

**Jira epic:** [KAN-22](https://neom.atlassian.net/browse/KAN-22)
**Status:** Active development — Sprint 24 / Sprint 25
**Owners:** @neom-sindalah-leads, @neom-mobile

---

## Architecture overview

Sindalah is a two-app monorepo plus a set of backend services. Guests and staff use
separate React Native apps that share the same Node.js/GraphQL backend.

```
+--------------------+        +--------------------+
|  Guest mobile RN   |        |  Staff mobile RN   |
|  (concierge, yacht,|        |  (queue, VIP audit,|
|   spa, butler chat)|        |   therapist sched.)|
+---------+----------+        +----------+---------+
          |  GraphQL + WSS              |  GraphQL + WSS
          +-------------+---------------+
                        |
              +---------v----------+
              |  Edge / API gateway|
              +---------+----------+
                        |
   +--------------------+----------------------+----------------+
   |                    |                      |                |
+--v---------+   +------v---------+   +--------v-------+  +-----v-------+
| concierge- |   | opera-         |   | marina-        |  | vip-audit   |
| chat (WSS) |   | integration    |   | availability   |  | (append-    |
| AR<->EN    |   | folio sync     |   | 3 marinas      |  |  only log)  |
+------------+   +----------------+   +----------------+  +-------------+
```

### Apps

| Path                          | Stack                    | Purpose                                |
|-------------------------------|--------------------------|----------------------------------------|
| `apps/guest-mobile/`          | React Native + TS        | Guest-facing concierge app             |
| `apps/staff-mobile/`          | React Native + TS        | Staff ops — queue, VIP, therapist view |

### Services

| Path                              | Stack                       | Purpose                                       |
|-----------------------------------|-----------------------------|-----------------------------------------------|
| `services/concierge-chat/`        | Node.js + TS + WebSocket    | Threaded butler chat, AR<->EN translation     |
| `services/opera-integration/`     | Node.js + TS                | Opera PMS folio sync, idempotent charge post  |
| `services/marina-availability/`   | Node.js + TS                | Aggregates 3 marina inventories for yachts    |
| `services/vip-audit/`             | Node.js + TS                | Append-only, tamper-evident staff action log  |

---

## Getting started

### Prerequisites

- Node.js 20.x
- pnpm 9.x
- Xcode 15 (iOS) / Android Studio Hedgehog (Android)
- Access to the Opera PMS sandbox (see `docs/opera-api-contract.md`)
- Postgres 15 (local docker)

### Install

```bash
pnpm install
pnpm -r build
```

### Run guest app (iOS)

```bash
pnpm --filter guest-mobile ios
```

### Run staff app (Android)

```bash
pnpm --filter staff-mobile android
```

### Run backend services locally

```bash
pnpm --filter concierge-chat dev
pnpm --filter opera-integration dev
pnpm --filter marina-availability dev
pnpm --filter vip-audit dev
```

---

## Active work (Sprint 24/25)

| Jira     | Title                                                             | State        |
|----------|-------------------------------------------------------------------|--------------|
| KAN-39   | Butler chat — Slack-style threaded guest concierge                | In Progress  |
| KAN-40   | Opera PMS deep integration — folio sync                           | In Review    |
| KAN-41   | Yacht booking calendar — multi-marina availability                | In Progress  |
| KAN-42   | VIP audit trail — staff action logging                            | To Do (S25)  |
| KAN-43   | Wellness reservations — therapist schedule view                   | To Do (S25)  |
| KAN-55   | [P1] Butler chat — message order reversed in long threads         | In Progress  |
| KAN-56   | [P2] Opera folio sync — double-charge on spa+yacht same-day       | In Review    |

---

## Contributing

- Branch naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- All PRs require review from the relevant CODEOWNERS
- Reference the Jira ticket in the PR title (e.g. `feat(concierge-chat): ... [KAN-39]`)
- Mobile changes must pass `mobile-ci`; backend changes must pass `backend-ci`

See `.github/PULL_REQUEST_TEMPLATE.md`.

## Docs

- [Architecture](docs/architecture.md)
- [VIP handling](docs/vip-handling.md)
- [Opera API contract](docs/opera-api-contract.md)
