import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';

// KAN-42 — VIP audit trail: staff action timeline for a single guest/thread.
// Read-only view; writes happen from action composers in other screens.

type AuditEntry = {
  id: string;
  occurredAt: string;
  actorStaffId: string;
  actorRole: string;
  action: string;
  reason: string;
  before: unknown;
  after: unknown;
  hash: string;
  prevHash: string;
};

export default function VIPAuditScreen() {
  const route = useRoute<any>();
  const threadId: string = route.params?.threadId;
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [chainOk, setChainOk] = useState(true);

  useEffect(() => {
    fetch(`https://api.sindalah/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($t:ID!){vipAudit(threadId:$t){entries{id occurredAt actorStaffId actorRole action reason before after hash prevHash} chainOk}}',
        variables: { t: threadId },
      }),
    })
      .then(r => r.json())
      .then(j => {
        setEntries(j.data?.vipAudit?.entries ?? []);
        setChainOk(j.data?.vipAudit?.chainOk ?? true);
      });
  }, [threadId]);

  return (
    <View style={styles.container}>
      {!chainOk && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            VIP audit chain integrity check failed — escalate to compliance before any
            further VIP actions.
          </Text>
        </View>
      )}
      <FlatList
        data={entries}
        keyExtractor={e => e.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.action}>{item.action}</Text>
            <Text style={styles.meta}>
              {new Date(item.occurredAt).toLocaleString()} · {item.actorRole} ·{' '}
              {item.actorStaffId}
            </Text>
            <Text style={styles.reason}>"{item.reason}"</Text>
            <Text style={styles.hash}>{item.hash.slice(0, 16)}…</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F33' },
  banner: { backgroundColor: '#7A1F1F', padding: 12 },
  bannerText: { color: '#F4E9D2', fontWeight: '600' },
  row: { padding: 12, borderBottomColor: '#13314F', borderBottomWidth: 1 },
  action: { color: '#C9A961', fontWeight: '600' },
  meta: { color: '#9BB0C3', fontSize: 11, marginTop: 4 },
  reason: { color: '#F4E9D2', marginTop: 6 },
  hash: { color: '#5C7081', fontSize: 10, marginTop: 4, fontFamily: 'Menlo' },
});
