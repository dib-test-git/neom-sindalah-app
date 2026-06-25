/**
 * AR <-> EN translation helper for butler chat.
 *
 * Heuristic: if the message looks Arabic and the staff agent is reading in EN,
 * we translate to EN and attach it as `bodyTranslated`. Same for the reverse.
 *
 * NB: this is intentionally a thin wrapper. The real translation call goes to
 * NEOM's regional translation gateway — PII must NEVER leave region.
 */

export type Lang = 'en' | 'ar';

export type TranslatedMessage = {
  body: string;            // translated body
  detectedLang: Lang;      // detected source lang
  confident: boolean;
};

// Cheap script-based detection.
const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

export function detectLang(text: string): Lang {
  return ARABIC_RANGE.test(text) ? 'ar' : 'en';
}

/**
 * Translate the inbound body when the source language differs from the staff
 * reading language. Returns the translation; the caller stores both.
 *
 * Today this no-ops in unit tests (no network) and calls the regional
 * gateway in real runtimes.
 */
export async function translateIfNeeded(
  body: string,
  declaredLang?: Lang,
): Promise<TranslatedMessage> {
  const detected = declaredLang ?? detectLang(body);

  // Short-circuit empty bodies, URLs, and tokens-only payloads.
  if (!body.trim() || /^https?:\/\//i.test(body.trim())) {
    return { body, detectedLang: detected, confident: false };
  }

  if (process.env.TRANSLATION_DISABLED === '1') {
    return { body, detectedLang: detected, confident: false };
  }

  const target: Lang = detected === 'ar' ? 'en' : 'ar';

  const res = await fetch(
    `${process.env.TRANSLATION_GATEWAY_URL ?? 'http://localhost:9090'}/translate`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: body, source: detected, target }),
    },
  );

  if (!res.ok) {
    return { body, detectedLang: detected, confident: false };
  }

  const json = (await res.json()) as { translated: string; confidence?: number };

  return {
    body: json.translated,
    detectedLang: detected,
    confident: (json.confidence ?? 0) >= 0.85,
  };
}

/**
 * Scrub PII before logging or before sending to a non-region-pinned worker.
 * Strips: passport-shaped IDs, KSA national IDs, credit card numbers, emails.
 */
export function scrubPii(text: string): string {
  return text
    .replace(/\b\d{10}\b/g, '[id]')
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, '[passport]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[card]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
}
