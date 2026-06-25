import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// Staff-side queue of open butler threads (KAN-39).
// Tapping a row opens the thread; long-press opens the VIP audit timeline (KAN-42).

type QueueItem = {
  threadId: string;
  guestName: string;
  vipTier: 'Royal' | 'Diamond' | 'Platinum' | 'Standard';
  lastMessagePreview: string;
  waitingMin: number;
  unread: number;
  language: 'en' | 'ar';
};

export default function ConciergeQueueScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    // GraphQL subscription: conciergeQueueUpdated
    // For now: poll every 5s.
    let cancelled = false;
    const tick = async () => {
      const res = await fetch('https://api.sindalah/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query:
            '{conciergeQueue{threadId guestName vipTier lastMessagePreview waitingMin unread language}}',
        }),
      });
      const j = await res.json();
      if (!cancelled) setItems(j.data?.conciergeQueue ?? []);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={i => i.threadId}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('ButlerThread', { threadId: item.threadId })}
          onLongPress={() => navigation.navigate('VIPAudit', { threadId: item.threadId })}
        >
          <View style={styles.headerRow}>
            <Text style={styles.name}>{item.guestName}</Text>
            {item.vipTier !== 'Standard' && (
              <Text style={[styles.vip, vipStyle(item.vipTier)]}>{item.vipTier}</Text>
            )}
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {item.lastMessagePreview}
          </Text>
          <Text style={styles.meta}>
            {item.waitingMin}m waiting · {item.language.toUpperCase()} · {item.unread} unread
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

function vipStyle(tier: QueueItem['vipTier']) {
  if (tier === 'Royal')    return { color: '#C9A961' };
  if (tier === 'Diamond')  return { color: '#9DD7F2' };
  if (tier === 'Platinum') return { color: '#D8D8D8' };
  return { color: '#9BB0C3' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F33' },
  row: { padding: 14, borderBottomColor: '#13314F', borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { color: '#F4E9D2', fontSize: 15, fontWeight: '600' },
  vip: { fontSize: 11, letterSpacing: 1 },
  preview: { color: '#9BB0C3', fontSize: 13, marginTop: 4 },
  meta: { color: '#7E94A8', fontSize: 11, marginTop: 6 },
});
