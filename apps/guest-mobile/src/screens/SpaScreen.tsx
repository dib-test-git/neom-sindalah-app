import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

// Spa booking surface. Charges post via opera-integration (KAN-40);
// see services/opera-integration/src/folio_sync.ts for the idempotency key.

type SpaOffering = {
  id: string;
  name: string;
  durationMin: number;
  priceSar: number;
  therapistTier: 'standard' | 'senior' | 'master';
};

const OFFERINGS: SpaOffering[] = [
  { id: 'aroma-60',  name: 'Aromatherapy massage',  durationMin: 60,  priceSar: 850,   therapistTier: 'standard' },
  { id: 'hammam-90', name: 'Royal Hammam ritual',   durationMin: 90,  priceSar: 1450,  therapistTier: 'senior' },
  { id: 'couple-90', name: "Couples' retreat",      durationMin: 90,  priceSar: 2900,  therapistTier: 'senior' },
  { id: 'sound-45',  name: 'Sound bath',            durationMin: 45,  priceSar: 650,   therapistTier: 'standard' },
  { id: 'master-120',name: 'Master therapist suite',durationMin: 120, priceSar: 4200,  therapistTier: 'master' },
];

export default function SpaScreen() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <FlatList
        data={OFFERINGS}
        keyExtractor={o => o.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, selected === item.id && styles.rowSelected]}
            onPress={() => setSelected(item.id)}
          >
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.durationMin} {t('spa.min')} · {item.priceSar.toLocaleString()} SAR
            </Text>
            <Text style={styles.tier}>{item.therapistTier.toUpperCase()}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1F33' },
  row: { padding: 16, borderBottomColor: '#13314F', borderBottomWidth: 1 },
  rowSelected: { backgroundColor: '#13314F' },
  title: { color: '#F4E9D2', fontSize: 16, fontWeight: '600' },
  meta: { color: '#9BB0C3', fontSize: 12, marginTop: 4 },
  tier: { color: '#C9A961', fontSize: 10, marginTop: 6, letterSpacing: 1 },
});
