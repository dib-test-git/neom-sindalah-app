/**
 * Opera PMS folio sync.
 *
 * Owns: reservation read-through, charge posting with idempotency, webhook
 * reconciliation. See docs/opera-api-contract.md.
 *
 * KNOWN ISSUE — KAN-56 (P2):
 *   Same-day double-charge when a guest books spa AND yacht on the same calendar
 *   day. The idempotency key today is keyed on reservation + surface only, so the
 *   second cart is treated as a replay of the first when both posts hit Opera
 *   within the 24h dedupe window. Fix is in flight on `fix/folio-idempotency`
 *   (PR #4, draft).
 */
import { postFolioCharge, OperaChargeRequest, OperaFolioLockedError, OperaRateLimitedError } from './charge_posting';
import { ulid } from 'ulid';

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

/**
 * Build the idempotency key for an Opera folio post.
 *
 * Today: `sindalah:<reservationId>:<surface>`
 * Tomorrow (fix/folio-idempotency): include localDate + items hash.
 */
export function buildIdempotencyKey(intent: FolioChargeIntent): string {
  return `sindalah:${intent.reservationId}:${intent.surface}`;
}

/**
 * Sync a single charge intent to the Opera folio.
 *
 * The flow:
 *  1. Build idempotency key.
 *  2. Check our local `charge_log` for a recent post with the same key.
 *  3. If absent, POST to Opera with the X-Opera-Idempotency-Key header.
 *     - Retry on transient errors (423 locked, 429 rate-limited) with
 *       exponential backoff, capped at MAX_RETRY_ATTEMPTS.
 *  4. Record the result (or terminal failure) in `charge_log`.
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
