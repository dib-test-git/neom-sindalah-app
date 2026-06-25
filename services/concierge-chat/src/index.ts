/**
 * concierge-chat — WebSocket entry point for Sindalah butler chat (KAN-39).
 *
 * Responsibilities:
 *  - Accept guest + butler WS connections (separate URL paths)
 *  - Route messages into per-thread monotonic-seq pipelines (see ./threads)
 *  - Run inbound text through AR<->EN translation (see ./translation)
 *  - Persist to Postgres via the `messages` table
 *
 * NOT responsible for: charge posting (see services/opera-integration),
 * VIP audit (see services/vip-audit).
 */
import Fastify from 'fastify';
import { WebSocketServer, WebSocket } from 'ws';
import pino from 'pino';
import { Pool } from 'pg';

import { appendToThread, listThreadOrdered, ChatMessageInput } from './threads';
import { translateIfNeeded } from './translation';

const log = pino({ name: 'concierge-chat' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PORT = Number(process.env.PORT ?? 8081);

async function main() {
  const app = Fastify({ logger: false });

  app.get('/healthz', async () => ({ ok: true, service: 'concierge-chat' }));

  await app.listen({ port: PORT, host: '0.0.0.0' });
  log.info({ port: PORT }, 'http listening');

  const wss = new WebSocketServer({ server: app.server, path: '/butler' });

  wss.on('connection', (socket: WebSocket, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const threadId = url.searchParams.get('thread');
    const role = url.searchParams.get('role') === 'butler' ? 'butler' : 'guest';

    if (!threadId) {
      socket.close(4400, 'thread param required');
      return;
    }

    log.info({ threadId, role }, 'ws.connect');

    // Replay thread history in order on connect — see KAN-55 for the long-thread bug
    // the ordering helper protects against.
    listThreadOrdered(pool, threadId)
      .then(history => {
        for (const m of history) socket.send(JSON.stringify(m));
      })
      .catch(err => log.error({ err, threadId }, 'history.replay.failed'));

    socket.on('message', async raw => {
      try {
        const payload = JSON.parse(String(raw)) as {
          body: string;
          parentId?: string | null;
          lang?: 'en' | 'ar';
        };

        const translated = await translateIfNeeded(payload.body, payload.lang);

        const input: ChatMessageInput = {
          threadId,
          parentId: payload.parentId ?? null,
          authorRole: role,
          body: payload.body,
          bodyTranslated: translated.body,
          lang: payload.lang ?? translated.detectedLang,
        };

        const stored = await appendToThread(pool, input);

        // Broadcast to everyone subscribed to this thread.
        for (const peer of wss.clients) {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify(stored));
          }
        }
      } catch (err) {
        log.error({ err }, 'ws.message.failed');
      }
    });

    socket.on('close', code => log.info({ code, threadId, role }, 'ws.close'));
  });
}

main().catch(err => {
  log.error({ err }, 'fatal');
  process.exit(1);
});
