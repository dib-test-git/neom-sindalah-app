import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

// KAN-41 — yacht booking calendar with multi-marina availability.

type Slot = {
  id: string;
  marina: 'Sindalah North' | 'Sindalah South' | 'Sindalah West Cove';
  yachtClass: 'Sport' | 'Sailing' | 'Luxury';
  startsAt: string; // ISO
  durationHours: number;
  priceSar: number;
  available: number;
};

export default function YachtBookingScreen() {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // GraphQL query against marina-availability aggregator
    // query Yachts($date:Date!){ yachtAvailability(date:$date){ id marina yachtClass startsAt durationHours priceSar available } }
    fetch('https://api.sindalah/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($d:Date!){yachtAvailability(date:$d){id marina yachtClass startsAt durationHours priceSar available}}',
        variables: { d: new Date().toISOString().slice(0, 10) },
      }),
    })
      .then(r => r.json())
      .then(j => setSlots(j.data?.yachtAvailability ?? []));
  }, []);

  if (!slots) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#F4E9D2" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={slots}
      keyExtractor={s => s.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.row, selected === item.id && styles.rowSelected]}
          onPress={() => setSelected(item.id)}
        >
          <Text style={styles.title}>
            {item.yachtClass} · {item.marina}
          </Text>
          <Text style={styles.meta}>
            {new Date(item.startsAt).toLocaleString()} · {item.durationHours}h ·{' '}
            {item.priceSar.toLocaleString()} SAR
          </Text>
          <Text style={styles.avail}>
            {item.available} {t('yacht.available')}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F33' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F33' },
  row: {
    padding: 16,
    borderBottomColor: '#13314F',
    borderBottomWidth: 1,
    backgroundColor: '#0B1F33',
  },
  rowSelected: { backgroundColor: '#13314F' },
  title: { color: '#F4E9D2', fontSize: 16, fontWeight: '600' },
  meta: { color: '#9BB0C3', fontSize: 12, marginTop: 4 },
  avail: { color: '#7CCFA7', fontSize: 11, marginTop: 4 },
});
