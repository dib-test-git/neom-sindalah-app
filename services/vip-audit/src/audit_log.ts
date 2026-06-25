/**
 * Append-only VIP audit log (KAN-42).
 *
 * Each record is hash-chained to the previous one in the same partition
 * (`guestId`). The chain head is published daily for tamper evidence
 * (see docs/vip-handling.md).
 *
 * Writes are accepted only via `appendEntry`; there is no update or delete.
 * The Postgres table backing this is created with REVOKE UPDATE, DELETE FROM
 * everyone except the daily ops migration role.
 */
import { Pool } from 'pg';
import { ulid } from 'ulid';
import { createHash } from 'node:crypto';

export type VipAction =
  | 'rate.change'
  | 'comp.add'
  | 'room.move'
  | 'folio.adjust'
  | 'butler.override'
  | 'spa.complimentary'
  | 'yacht.complimentary';

export type VipAuditEntryInput = {
  actorStaffId: string;
  actorRole: 'butler' | 'concierge' | 'manager' | 'dge' | 'system';
  guestId: string;
  reservationId: string;
  vipTier: string;
  action: VipAction;
  before: unknown;
  after: unknown;
  reason: string;
  occurredAt: string;
};

export type VipAuditEntry = VipAuditEntryInput & {
  id: string;
  prevHash: string;
  hash: string;
  recordedAt: string;
};

const GENESIS_HASH = '0'.repeat(64);

function canonicalJson(value: unknown): string {
  // RFC 8785-ish: stable key ordering. Good enough for hashing internal payloads.
  return JSON.stringify(value, Object.keys(flatten(value)).sort());
}

function flatten(value: unknown, prefix = '', acc: Record<string, unknown> = {}) {
  if (value === null || typeof value !== 'object') {
    acc[prefix || '$'] = value;
    return acc;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, acc);
  }
  return acc;
}

export function hashEntry(prevHash: string, payload: VipAuditEntryInput): string {
  const h = createHash('sha256');
  h.update(prevHash);
  h.update(canonicalJson(payload));
  return h.digest('hex');
}

/**
 * Append a single entry to the audit log for `guestId`.
 *
 * Strict server-side rules:
 *  - `reason` is required, max 500 chars.
 *  - `comp.add` with `amount > 50000 SAR` requires actorRole === 'dge'.
 *  - `butler.override` requires actorRole === 'dge'.
 */
export async function appendEntry(
  pool: Pool,
  input: VipAuditEntryInput,
): Promise<VipAuditEntry> {
  validate(input);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.guestId]);

    const { rows } = await client.query<{ hash: string }>(
      `SELECT hash FROM vip_audit
        WHERE guest_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [input.guestId],
    );
    const prevHash = rows[0]?.hash ?? GENESIS_HASH;
    const hash = hashEntry(prevHash, input);
    const id = ulid();
    const recordedAt = new Date().toISOString();

    await client.query(
      `INSERT INTO vip_audit
         (id, guest_id, reservation_id, vip_tier, actor_staff_id, actor_role,
          action, before_state, after_state, reason, occurred_at, recorded_at,
          prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        input.guestId,
        input.reservationId,
        input.vipTier,
        input.actorStaffId,
        input.actorRole,
        input.action,
        JSON.stringify(input.before),
        JSON.stringify(input.after),
        input.reason,
        input.occurredAt,
        recordedAt,
        prevHash,
        hash,
      ],
    );

    await client.query('COMMIT');

    return { ...input, id, prevHash, hash, recordedAt };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify the chain for a single guest. Returns the index of the first broken
 * link, or -1 if the chain is intact.
 */
export async function verifyChain(pool: Pool, guestId: string): Promise<number> {
  const { rows } = await pool.query<{
    prev_hash: string;
    hash: string;
    payload: VipAuditEntryInput;
  }>(
    `SELECT prev_hash, hash,
            jsonb_build_object(
              'actorStaffId', actor_staff_id,
              'actorRole', actor_role,
              'guestId', guest_id,
              'reservationId', reservation_id,
              'vipTier', vip_tier,
              'action', action,
              'before', before_state,
              'after', after_state,
              'reason', reason,
              'occurredAt', occurred_at
            ) AS payload
       FROM vip_audit
      WHERE guest_id = $1
      ORDER BY recorded_at ASC`,
    [guestId],
  );

  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.prev_hash !== expectedPrev) return i;
    if (hashEntry(r.prev_hash, r.payload) !== r.hash) return i;
    expectedPrev = r.hash;
  }
  return -1;
}

function validate(e: VipAuditEntryInput) {
  if (!e.reason || e.reason.length > 500) throw new Error('vip-audit.reason.invalid');
  if (e.action === 'butler.override' && e.actorRole !== 'dge') {
    throw new Error('vip-audit.butler-override.requires-dge');
  }
  if (e.action === 'comp.add') {
    const amount = (e.after as { amountSar?: number })?.amountSar ?? 0;
    if (amount > 50_000 && e.actorRole !== 'dge') {
      throw new Error('vip-audit.large-comp.requires-dge');
    }
  }
}
