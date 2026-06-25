/**
 * Opera PMS folio sync.
 *
 * Owns: reservation read-through, charge posting with idempotency, webhook
 * reconciliation. See docs/opera-api-contract.md.
 */
import { postFolioCharge, OperaChargeRequest, OperaFolioLockedError, OperaRateLimitedError } from './charge_posting';
import { ulid } from 'ulid';
import { createHash } from 'node:crypto';

export type ChargeSurface = 'spa' | 'yacht' | 'butler' | 'wellness' | 'minibar' | 'fnb';

export type FolioChargeIntent = {
  reservationId: string;
  surface: ChargeSurface;
  items: Array<{ sku: string; description: string; amountSar: number; qty: number }>;
  occurredAt: string; // ISO
};

export type FolioChargeResult =
  | { status: 'posted'; operaChargeId: string; idempotencyKey: string }
  | { status: 'duplicate'; idempotencyKey: string; operaChargeId?: string }
  | { status: 'failed'; error: string; idempotencyKey: string };

export type ChargeLogStore = {
  findRecent(key: string): Promise<{ operaChargeId: string } | null>;
  recordPost(row: { key: string; operaChargeId: string }): Promise<void>;
  recordFailure(row: { key: string; error: string }): Promise<void>;
};

const MAX_RETRY_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 250;
const LOCAL_TZ = 'Asia/Riyadh';

/**
 * Build the idempotency key for an Opera folio post.
 *
 * Format (KAN-56 fix):
 *
 *   sindalah:<reservationId>:<surface>:<localDate>:<sha1(items)>
 *
 * The local date is computed in `Asia/Riyadh` (Sindalah's operational TZ),
 * NOT UTC — otherwise a 02:00 local post crosses the UTC midnight and is
 * treated as a different day from a 23:00 local post six hours earlier.
 *
 * The items hash is over a canonicalised, key-sorted serialisation of
 * `items[]` so that the same cart in a different key order still collapses
 * to one idempotency key.
 *
 * Why this matters: previously the key was just
 *   `sindalah:<reservationId>:<surface>`
 * which is unique only within a 24h Opera dedupe window. A guest who books
 * spa AND yacht on the same calendar day — with carts in subtly different
 * shapes — could trigger an Opera-side replay collision because the second
 * cart's surface alone matched the first. See KAN-56.
 */
export function buildIdempotencyKey(intent: FolioChargeIntent): string {
  const localDate = formatLocalDate(intent.occurredAt, LOCAL_TZ);
  const itemsHash = hashItems(intent.items);
  return `sindalah:${intent.reservationId}:${intent.surface}:${localDate}:${itemsHash}`;
}

function formatLocalDate(iso: string, timeZone: string): string {
  // YYYY-MM-DD in the named time zone. Stable across DST (Riyadh has none) and
  // unaffected by the worker's process TZ.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(iso));
}

function hashItems(items: FolioChargeIntent['items']): string {
  const canonical = items
    .map(i => ({
      sku: i.sku,
      description: i.description,
      amountSar: i.amountSar,
      qty: i.qty,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.description.localeCompare(b.description));
  const h = createHash('sha1');
  h.update(JSON.stringify(canonical));
  return h.digest('hex').slice(0, 16);
}

/**
 * Sync a single charge intent to the Opera folio.
 */
export async function syncCharge(
  intent: FolioChargeIntent,
  store: ChargeLogStore,
): Promise<FolioChargeResult> {
  const idempotencyKey = buildIdempotencyKey(intent);

  const cached = await store.findRecent(idempotencyKey);
  if (cached) {
    return { status: 'duplicate', idempotencyKey, operaChargeId: cached.operaChargeId };
  }

  const req: OperaChargeRequest = {
    reservationId: intent.reservationId,
    items: intent.items.map(i => ({
      sku: i.sku,
      description: i.description,
      amountSar: i.amountSar,
      qty: i.qty,
    })),
    idempotencyKey,
    requestId: ulid(),
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await postFolioCharge(req);

      if (res.status === 'replayed') {
        await store.recordPost({ key: idempotencyKey, operaChargeId: res.chargeId });
        return { status: 'duplicate', idempotencyKey, operaChargeId: res.chargeId };
      }

      await store.recordPost({ key: idempotencyKey, operaChargeId: res.chargeId });
      return { status: 'posted', operaChargeId: res.chargeId, idempotencyKey };
    } catch (err) {
      lastError = err as Error;
      if (!isRetryable(err)) break;
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  const errorMessage = lastError?.message ?? 'unknown';
  await store.recordFailure({ key: idempotencyKey, error: errorMessage });
  return { status: 'failed', error: errorMessage, idempotencyKey };
}

function isRetryable(err: unknown): boolean {
  return err instanceof OperaFolioLockedError || err instanceof OperaRateLimitedError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
