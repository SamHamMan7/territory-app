// Badges & leaderboard tab.
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandCollections, nextTier, tierFor } from '@/game/badges';
import { CONFIG } from '@/game/config';
import { actions, fmtArea, leaderboard, useGame } from '@/game/store';

const C = { card: '#141824', line: '#232a3a', text: '#eef2ff', dim: '#8a93a8', accent: '#00f0ff' };

export default function BadgesScreen() {
  const insets = useSafeAreaInsets();
  const s = useGame((x) => x);
  const board = leaderboard(s);
  const places = Object.values(s.badges.places).sort((a, b) => b.laps - a.laps || b.lastAt - a.lastAt);
  const brands = brandCollections(s.badges);
  const totalLaps = places.reduce((n, p) => n + p.laps, 0);
  const me = board.find((b) => b.isMe);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }}>
      <Text style={styles.h1}>Badges</Text>
      <View style={styles.statsRow}>
        <Stat label="Land" value={fmtArea(me?.area ?? 0)} />
        <Stat label="Places" value={String(places.length)} />
        <Stat label="Laps" value={String(totalLaps)} />
        <Stat label="Stolen" value={fmtArea(me?.stats.stolen ?? 0)} />
      </View>

      <Text style={styles.h2}>Free-for-all leaderboard</Text>
      <View style={styles.card}>
        {board.map((p, i) => (
          <View key={p.id} style={[styles.lbRow, i > 0 && styles.sep]}>
            <Text style={[styles.rank, i === 0 && { color: '#ffc531' }]}>{i + 1}</Text>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text style={[styles.name, p.isMe && { color: C.accent }]}>{p.name}{p.isMe ? '' : ' 🤖'}</Text>
            <Text style={styles.value}>{fmtArea(p.area)}</Text>
          </View>
        ))}
        <Text style={styles.note}>Rivals are simulated for now — they walk, raid and steal by the same rules you do.</Text>
      </View>

      {brands.length > 0 && (
        <>
          <Text style={styles.h2}>Collections</Text>
          <View style={styles.grid}>
            {brands.map((b) => {
              const tier = tierFor(b.laps);
              return (
                <View key={b.brand} style={[styles.brand, { borderColor: tier?.color ?? C.line }]}>
                  <Text style={{ fontSize: 30 }}>{b.emoji}</Text>
                  <Text style={styles.brandName} numberOfLines={1}>{b.brand}</Text>
                  <Text style={[styles.tier, { color: tier?.color ?? C.dim }]}>{tier?.name ?? '—'}</Text>
                  <Text style={styles.small}>{b.locations} {b.locations === 1 ? 'location' : 'locations'} · {b.laps} laps</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.h2}>Places</Text>
      {places.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            Walk a full loop around any place on the map — a McDonald&apos;s, a park, your school — to earn its badge.
            Keep circling to level it up:
          </Text>
          <View style={styles.tiers}>
            {CONFIG.LAP_TIERS.map((t) => (
              <Text key={t.name} style={[styles.tierChip, { color: t.color, borderColor: t.color }]}>{t.name} · {t.laps}</Text>
            ))}
          </View>
        </View>
      ) : (
        places.map((p) => {
          const tier = tierFor(p.laps);
          const next = nextTier(p.laps);
          const prevAt = tier?.laps ?? 0;
          const pct = next ? (p.laps - prevAt) / (next.laps - prevAt) : 1;
          return (
            <View key={p.placeId} style={[styles.card, styles.placeRow]}>
              <View style={[styles.medal, { borderColor: tier?.color ?? C.line }]}>
                <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.tier, { color: tier?.color ?? C.dim }]}>
                  {tier?.name} <Text style={styles.small}>· {p.laps} {p.laps === 1 ? 'lap' : 'laps'}{next ? ` · ${next.laps - p.laps} to ${next.name}` : ''}</Text>
                </Text>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: next?.color ?? tier?.color }]} /></View>
              </View>
            </View>
          );
        })
      )}

      <Pressable
        style={styles.reset}
        onPress={() => Alert.alert('Reset world?', 'Clears your land, badges and rivals on this device.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: () => actions.resetWorld() },
        ])}>
        <Text style={{ color: '#ff8fa3', fontWeight: '700' }}>Reset world</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
  h1: { color: C.text, fontSize: 30, fontWeight: '900', marginBottom: 12 },
  h2: { color: C.dim, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: C.line },
  statValue: { color: C.text, fontSize: 16, fontWeight: '800' },
  statLabel: { color: C.dim, fontSize: 10, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  rank: { color: C.dim, width: 22, fontWeight: '900', fontSize: 15 },
  swatch: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  name: { color: C.text, fontWeight: '700', fontSize: 15, flex: 1 },
  value: { color: C.text, fontWeight: '800' },
  note: { color: C.dim, fontSize: 11, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  brand: { width: '31.5%', backgroundColor: C.card, borderRadius: 16, padding: 10, alignItems: 'center', borderWidth: 2 },
  brandName: { color: C.text, fontWeight: '800', fontSize: 12, marginTop: 4 },
  tier: { fontWeight: '800', fontSize: 13 },
  small: { color: C.dim, fontSize: 11, fontWeight: '500' },
  empty: { color: C.dim, lineHeight: 20 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tierChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, fontWeight: '700' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medal: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0d12' },
  bar: { height: 5, backgroundColor: '#232a3a', borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 5 },
  reset: { alignSelf: 'center', marginTop: 24, padding: 10 },
});
