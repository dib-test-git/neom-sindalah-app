import React, { useMemo, useRef, useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

// KAN-39 — Slack-style threaded butler chat surface.
// Ordering is driven by the server-issued monotonic `seq`, never by client time.
// See services/concierge-chat/src/threads.ts and KAN-55 (long-thread ordering bug).

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
};

type Props = {
  messages: ChatMessage[];
};

export default function ChatThread({ messages }: Props) {
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
      renderItem={({ item }) => (
        <View
          style={[
            styles.bubble,
            item.authorRole === 'guest' ? styles.bubbleGuest : styles.bubbleButler,
          ]}
        >
          <Text style={styles.body}>{item.body}</Text>
          {item.bodyTranslated && (
            <Text style={styles.translation}>{item.bodyTranslated}</Text>
          )}
          <Text style={styles.meta}>
            #{item.seq} · {new Date(item.postedAt).toLocaleTimeString()}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 12, marginBottom: 8 },
  bubbleGuest: { alignSelf: 'flex-end', backgroundColor: '#13314F' },
  bubbleButler: { alignSelf: 'flex-start', backgroundColor: '#1B3F61' },
  body: { color: '#F4E9D2', fontSize: 15 },
  translation: { color: '#9BB0C3', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  meta: { color: '#7E94A8', fontSize: 10, marginTop: 4 },
});
