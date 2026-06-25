import React, { useMemo, useRef, useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

// KAN-39 — Slack-style threaded butler chat surface.
// Ordering is driven by the server-issued monotonic `seq`, never by client time.
// See services/concierge-chat/src/threads.ts and KAN-55 (long-thread ordering bug).

export type Reaction = { emoji: string; userId: string; addedAt: string };

export type ChatMessage = {
  id: string;
  threadId: string;
  parentId: string | null;
  seq: number;
  authorRole: 'guest' | 'butler' | 'system';
  body: string;
  lang: 'en' | 'ar';
  bodyTranslated?: string;
  postedAt: string; // ISO
  readBy?: string[];
  reactions?: Reaction[];
};

type Props = {
  messages: ChatMessage[];
  currentUserId: string;
};

export default function ChatThread({ messages, currentUserId }: Props) {
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Defensive: always order by `seq`. If `seq` is missing on some legacy rows,
  // fall back to `postedAt`. This is the surface side of the KAN-55 fix.
  const ordered = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (typeof a.seq === 'number' && typeof b.seq === 'number') return a.seq - b.seq;
      return a.postedAt.localeCompare(b.postedAt);
    });
  }, [messages]);

  useEffect(() => {
    if (ordered.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [ordered.length]);

  return (
    <FlatList
      ref={listRef}
      data={ordered}
      keyExtractor={m => m.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isMine = item.authorRole === 'guest';
        const readByOther =
          isMine && (item.readBy ?? []).some(u => u !== currentUserId);

        return (
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleGuest : styles.bubbleButler,
            ]}
          >
            <Text style={styles.body}>{item.body}</Text>
            {item.bodyTranslated && (
              <Text style={styles.translation}>{item.bodyTranslated}</Text>
            )}
            {item.reactions && item.reactions.length > 0 && (
              <View style={styles.reactionRow}>
                {summariseReactions(item.reactions).map(r => (
                  <Text key={r.emoji} style={styles.reaction}>
                    {r.emoji} {r.count}
                  </Text>
                ))}
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                #{item.seq} · {new Date(item.postedAt).toLocaleTimeString()}
              </Text>
              {isMine && (
                <Text style={[styles.receipt, readByOther && styles.receiptRead]}>
                  {readByOther ? 'Read' : 'Sent'}
                </Text>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

function summariseReactions(reactions: Reaction[]): Array<{ emoji: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count }));
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 12, marginBottom: 8 },
  bubbleGuest: { alignSelf: 'flex-end', backgroundColor: '#13314F' },
  bubbleButler: { alignSelf: 'flex-start', backgroundColor: '#1B3F61' },
  body: { color: '#F4E9D2', fontSize: 15 },
  translation: { color: '#9BB0C3', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  meta: { color: '#7E94A8', fontSize: 10 },
  receipt: { color: '#7E94A8', fontSize: 10 },
  receiptRead: { color: '#7CCFA7' },
  reactionRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  reaction: { color: '#C9A961', fontSize: 12 },
});
