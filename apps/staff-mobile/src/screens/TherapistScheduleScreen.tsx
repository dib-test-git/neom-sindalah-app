import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

// KAN-43 — Wellness reservations / therapist schedule view (staff side).

type Slot = {
  id: string;
  therapistId: string;
  therapistName: string;
  tier: 'standard' | 'senior' | 'master';
  start: string; // ISO
  end: string;   // ISO
  bookedBy?: { guestId: string; guestName: string; vipTier?: string };
};

export default function TherapistScheduleScreen() {
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    fetch('https://api.sindalah/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query:
          '{therapistSchedule(date:"today"){id therapistId therapistName tier start end bookedBy{guestId guestName vipTier}}}',
      }),
    })
      .then(r => r.json())
      .then(j => setSlots(j.data?.therapistSchedule ?? []));
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={slots}
      keyExtractor={s => s.id}
      renderItem={({ item }) => (
        <View style={[styles.row, item.bookedBy ? styles.rowBooked : styles.rowOpen]}>
          <Text style={styles.therapist}>
            {item.therapistName} <Text style={styles.tier}>· {item.tier}</Text>
          </Text>
          <Text style={styles.time}>
            {new Date(item.start).toLocaleTimeString()} –{' '}
            {new Date(item.end).toLocaleTimeString()}
          </Text>
          {item.bookedBy ? (
            <Text style={styles.guest}>
              {item.bookedBy.guestName}
              {item.bookedBy.vipTier ? ` · ${item.bookedBy.vipTier}` : ''}
            </Text>
          ) : (
            <Text style={styles.open}>Open</Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F33' },
  row: { padding: 12, borderBottomColor: '#13314F', borderBottomWidth: 1 },
  rowBooked: { backgroundColor: '#13314F' },
  rowOpen: {},
  therapist: { color: '#F4E9D2', fontWeight: '600' },
  tier: { color: '#C9A961', fontSize: 11 },
  time: { color: '#9BB0C3', fontSize: 12, marginTop: 4 },
  guest: { color: '#F4E9D2', marginTop: 6 },
  open: { color: '#7CCFA7', marginTop: 6 },
});
