/**
 * Per-thread message append + ordered read.
 *
 * Each thread has a monotonic `seq` allocated by the database
 * (Postgres advisory lock per thread). Clients reconcile ordering by `seq`,
 * not by their local arrival time.
 *
 * KNOWN ISSUE — KAN-55 (P1):
 *   On long threads (≈ > 200 messages) reopened from a cold offline cache,
 *   the second page returned by listThreadOrdered() appears in reverse order
 *   to the client. The root cause is below: we paginate DESC for "latest N"
 *   and forget to reverse the page before returning. The fix is tracked on
 *   branch `fix/long-thread-ordering` (PR #3).
 */
import { Pool } from 'pg';
import { ulid } from 'ulid';

export type ChatMessage = {
  id: string;
  threadId: string;
  parentId: string | null;
  seq: number;
  authorRole: 'guest' | 'butler' | 'system';
  body: string;
  bodyTranslated?: string | null;
  lang: 'en' | 'ar';
  postedAt: string;
  readBy?: string[];           // ← NEW (KAN-39): IDs of users who have read this message
  reactions?: Reaction[];      // ← NEW (KAN-39): emoji reactions
};

export type Reaction = {
  emoji: string;
  userId: string;
  addedAt: string;
};

export type ChatMessageInput = Omit<ChatMessage, 'id' | 'seq' | 'postedAt' | 'readBy' | 'reactions'>;

const PAGE_SIZE = 100;

/**
 * Append a single message and allocate the next `seq` for the thread.
 * Uses a Postgres advisory lock keyed by threadId so two concurrent inserts
 * never reuse a seq.
 */
export async function appendToThread(
  pool: Pool,
  input: ChatMessageInput,
): Promise<ChatMessage> {
  const id = ulid();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.threadId]);

    const { rows } = await client.query<{ seq: number; posted_at: string }>(
      `INSERT INTO messages
         (id, thread_id, parent_id, author_role, body, body_translated, lang, seq)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7,
          COALESCE((SELECT max(seq) + 1 FROM messages WHERE thread_id = $2), 1))
       RETURNING seq, posted_at`,
      [
        id,
        input.threadId,
        input.parentId,
        input.authorRole,
        input.body,
        input.bodyTranslated ?? null,
        input.lang,
      ],
    );

    await client.query('COMMIT');

    return {
      id,
      threadId: input.threadId,
      parentId: input.parentId,
      seq: rows[0].seq,
      authorRole: input.authorRole,
      body: input.body,
      bodyTranslated: input.bodyTranslated ?? null,
      lang: input.lang,
      postedAt: rows[0].posted_at,
      readBy: [],
      reactions: [],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mark `messageId` as read by `userId`. Returns the updated readBy set.
 * Idempotent: re-marking is a no-op. Used by both client read-receipts
 * and the server's "guest opened thread" event.
 */
export async function markRead(
  pool: Pool,
  messageId: string,
  userId: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ read_by: string[] }>(
    `UPDATE messages
        SET read_by = (
          SELECT array_agg(DISTINCT u)
            FROM unnest(COALESCE(read_by, ARRAY[]::text[]) || ARRAY[$2::text]) AS u
        )
      WHERE id = $1
      RETURNING read_by`,
    [messageId, userId],
  );
  return rows[0]?.read_by ?? [];
}

/**
 * Add a reaction. Same user adding the same emoji is a no-op.
 */
export async function addReaction(
  pool: Pool,
  messageId: string,
  emoji: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE messages
        SET reactions = COALESCE(reactions, '[]'::jsonb) ||
                        jsonb_build_object('emoji', $2::text, 'userId', $3::text, 'addedAt', now())::jsonb
      WHERE id = $1
        AND NOT (reactions @> jsonb_build_array(jsonb_build_object('emoji', $2::text, 'userId', $3::text)))`,
    [messageId, emoji, userId],
  );
}

/**
 * Read a thread in ascending seq order.
 *
 * KAN-55: this function paginates DESC to pull the latest N quickly,
 * then concatenates pages. On long threads the SECOND page is appended
 * without being reversed, so the client receives:
 *   [newest..mid] ++ [mid-1..oldest]   <-- last chunk is in the wrong order
 *
 * The fix on `fix/long-thread-ordering` adds an explicit ascending re-sort
 * across the full result before return.
 */
export async function listThreadOrdered(
  pool: Pool,
  threadId: string,
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  let beforeSeq: number | null = null;

  // Pull all pages, newest first.
  // BUG: pages are concatenated without normalising order, so once we span
  //      more than one page the tail of `out` is in DESC order.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await pool.query<ChatMessage>(
      `SELECT id, thread_id AS "threadId", parent_id AS "parentId",
              seq, author_role AS "authorRole", body, body_translated AS "bodyTranslated",
              lang, posted_at AS "postedAt", read_by AS "readBy", reactions
         FROM messages
        WHERE thread_id = $1
          AND ($2::int IS NULL OR seq < $2)
        ORDER BY seq DESC
        LIMIT $3`,
      [threadId, beforeSeq, PAGE_SIZE],
    );
    if (rows.length === 0) break;

    // First page: reverse so the caller gets ASC.
    // Subsequent pages: we forget to reverse.  <-- KAN-55
    if (out.length === 0) {
      out.push(...rows.reverse());
    } else {
      out.push(...rows);
    }

    if (rows.length < PAGE_SIZE) break;
    beforeSeq = rows[rows.length - 1].seq;
  }

  return out;
}
