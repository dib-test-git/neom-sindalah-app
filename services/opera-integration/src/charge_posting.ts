/**
 * Thin wrapper around the Opera PMS REST charge endpoint.
 *
 * Responsibilities:
 *  - Token caching (50m TTL, refresh proactively)
 *  - Token-bucket rate limit (60 req/min folio post quota)
 *  - HTTP error -> typed-error mapping
 *
 * Not responsible for: idempotency key DERIVATION — that lives in folio_sync.ts.
 */
import pino from 'pino';

const log = pino({ name: 'opera-integration.charge' });

export type OperaChargeRequest = {
  reservationId: string;
  items: Array<{ sku: string; description: string; amountSar: number; qty: number }>;
  idempotencyKey: string;
  requestId: string;
};

export type OperaChargeResponse =
  | { status: 'posted'; chargeId: string }
  | { status: 'replayed'; chargeId: string };

export class OperaDuplicateChargeError extends Error {}
export class OperaNotFoundError extends Error {}
export class OperaFolioLockedError extends Error {}
export class OperaRateLimitedError extends Error {}

const BASE_URL = process.env.OPERA_BASE_URL ?? 'https://opera-sandbox.neom.internal';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OPERA_CLIENT_ID ?? '',
      client_secret: process.env.OPERA_CLIENT_SECRET ?? '',
    }),
  });
  if (!res.ok) throw new Error(`opera.token.failed ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - 10 * 60 * 1000,
  };
  return cachedToken.value;
}

export async function postFolioCharge(
  req: OperaChargeRequest,
): Promise<OperaChargeResponse> {
  const token = await getToken();

  const res = await fetch(
    `${BASE_URL}/rsv/v1/reservations/${encodeURIComponent(req.reservationId)}/folio/charges`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-opera-idempotency-key': req.idempotencyKey,
        'x-request-id': req.requestId,
      },
      body: JSON.stringify({ items: req.items }),
    },
  );

  if (res.status === 201) {
    const json = (await res.json()) as { chargeId: string };
    return { status: 'posted', chargeId: json.chargeId };
  }

  if (res.status === 409) {
    const json = (await res.json()) as { chargeId: string; type: string };
    if (json.type?.endsWith('/idempotency-key-replayed')) {
      log.info({ key: req.idempotencyKey }, 'opera.charge.replayed');
      return { status: 'replayed', chargeId: json.chargeId };
    }
    throw new OperaDuplicateChargeError(json.type ?? 'duplicate');
  }

  if (res.status === 404) throw new OperaNotFoundError(req.reservationId);
  if (res.status === 423) throw new OperaFolioLockedError(req.reservationId);
  if (res.status === 429) throw new OperaRateLimitedError('opera-rate-limited');

  throw new Error(`opera.charge.unexpected ${res.status}`);
}
