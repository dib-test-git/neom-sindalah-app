import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

type Tile = {
  key: 'butler' | 'yacht' | 'spa' | 'wellness';
  titleKey: string;
  subtitleKey: string;
  route: 'ButlerChat' | 'YachtBooking' | 'Spa' | 'Wellness';
};

const TILES: Tile[] = [
  { key: 'butler',   titleKey: 'home.butler.title',   subtitleKey: 'home.butler.subtitle',   route: 'ButlerChat' },
  { key: 'yacht',    titleKey: 'home.yacht.title',    subtitleKey: 'home.yacht.subtitle',    route: 'YachtBooking' },
  { key: 'spa',      titleKey: 'home.spa.title',      subtitleKey: 'home.spa.subtitle',      route: 'Spa' },
  { key: 'wellness', titleKey: 'home.wellness.title', subtitleKey: 'home.wellness.subtitle', route: 'Wellness' },
];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>{t('home.greeting')}</Text>
      <Text style={styles.subGreeting}>{t('home.subGreeting')}</Text>

      <View style={styles.grid}>
        {TILES.map(tile => (
          <TouchableOpacity
            key={tile.key}
            style={styles.tile}
            onPress={() => navigation.navigate(tile.route)}
            accessibilityRole="button"
          >
            <Text style={styles.tileTitle}>{t(tile.titleKey)}</Text>
            <Text style={styles.tileSubtitle}>{t(tile.subtitleKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#0B1F33' },
  greeting: { color: '#F4E9D2', fontSize: 26, fontWeight: '600' },
  subGreeting: { color: '#9BB0C3', fontSize: 14, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '48%',
    backgroundColor: '#13314F',
    padding: 16,
    borderRadius: 12,
    minHeight: 110,
  },
  tileTitle: { color: '#F4E9D2', fontSize: 18, fontWeight: '600' },
  tileSubtitle: { color: '#9BB0C3', fontSize: 12, marginTop: 6 },
});
