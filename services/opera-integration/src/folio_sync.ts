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
import { postFolioCharge, OperaChargeRequest } from './charge_posting';
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
  | { status: 'duplicate'; idempotencyKey: string }
  | { status: 'failed'; error: string };

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
 *  4. Record the result in `charge_log`.
 */
export async function syncCharge(
  intent: FolioChargeIntent,
  deps: {
    findRecent: (key: string) => Promise<{ operaChargeId: string } | null>;
    recordPost: (row: { key: string; operaChargeId: string }) => Promise<void>;
  },
): Promise<FolioChargeResult> {
  const idempotencyKey = buildIdempotencyKey(intent);

  const cached = await deps.findRecent(idempotencyKey);
  if (cached) {
    return { status: 'duplicate', idempotencyKey };
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

  try {
    const res = await postFolioCharge(req);

    if (res.status === 'replayed') {
      // Opera signalled it already saw this key in the last 24h.
      // We treat this as duplicate for guest-facing purposes.
      return { status: 'duplicate', idempotencyKey };
    }

    await deps.recordPost({ key: idempotencyKey, operaChargeId: res.chargeId });
    return { status: 'posted', operaChargeId: res.chargeId, idempotencyKey };
  } catch (err) {
    return { status: 'failed', error: (err as Error).message };
  }
}
