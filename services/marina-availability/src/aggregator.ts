/**
 * Marina availability aggregator.
 *
 * Fans out an availability query to the three Sindalah marinas in parallel,
 * merges the results, and returns a single inventory list keyed by slot.
 * Falls back gracefully if one marina is degraded — we never block the whole
 * yacht booking experience on a single marina being slow.
 *
 * Linked: KAN-41.
 */
import pLimit from 'p-limit';
import { ulid } from 'ulid';

export type MarinaId = 'sindalah-north' | 'sindalah-south' | 'sindalah-west-cove';

export type Slot = {
  id: string;
  marina: MarinaId;
  yachtClass: 'Sport' | 'Sailing' | 'Luxury';
  startsAt: string;
  durationHours: number;
  priceSar: number;
  available: number;
};

export type MarinaClient = {
  id: MarinaId;
  fetchInventory(date: string): Promise<Slot[]>;
};

const MARINA_DISPLAY: Record<MarinaId, string> = {
  'sindalah-north': 'Sindalah North',
  'sindalah-south': 'Sindalah South',
  'sindalah-west-cove': 'Sindalah West Cove',
};

const CONCURRENCY = 3;
const PER_MARINA_TIMEOUT_MS = 800;

export async function aggregateAvailability(
  date: string,
  clients: MarinaClient[],
): Promise<{ slots: Slot[]; degradedMarinas: MarinaId[]; requestId: string }> {
  const requestId = ulid();
  const limit = pLimit(CONCURRENCY);
  const degraded: MarinaId[] = [];

  const results = await Promise.all(
    clients.map(c =>
      limit(async () => {
        try {
          const slots = await withTimeout(c.fetchInventory(date), PER_MARINA_TIMEOUT_MS);
          return slots;
        } catch {
          degraded.push(c.id);
          return [] as Slot[];
        }
      }),
    ),
  );

  const merged = results.flat();
  // Stable sort: by start time, then marina display name, then yacht class.
  merged.sort((a, b) => {
    if (a.startsAt !== b.startsAt) return a.startsAt.localeCompare(b.startsAt);
    const md = MARINA_DISPLAY[a.marina].localeCompare(MARINA_DISPLAY[b.marina]);
    if (md !== 0) return md;
    return a.yachtClass.localeCompare(b.yachtClass);
  });

  return { slots: merged, degradedMarinas: degraded, requestId };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('marina.timeout')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
