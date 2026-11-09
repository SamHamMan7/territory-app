// Badges tab.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UI, shadow } from '@/constants/ui';
import { brandCollections, lapsForLevel, nextTier, tierFor } from '@/game/badges';
import { CONFIG } from '@/game/config';
import { areaOf } from '@/game/engine';
import { actions, fmtArea, useGame } from '@/game/store';

export default function BadgesScreen() {
  const insets = useSafeAreaInsets();
  const s = useGame((x) => x);
  const me = s.world.players[s.meId];
  const places = Object.values(s.badges.places).sort((a, b) => b.laps - a.laps || b.lastAt - a.lastAt);
  const brands = brandCollections(s.badges);
  const totalLaps = places.reduce((n, p) => n + p.laps, 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 48 }}>
      <Text style={styles.h1}>Badges</Text>
      <Text style={styles.lead}>Walk all the way around a place to earn its badge. Keep circling to level it up.</Text>

      <View style={[styles.card, shadow, styles.stats]}>
        <Stat label="Land" value={fmtArea(me ? areaOf(me) : 0)} />
        <View style={styles.divider} />
        <Stat label="Places" value={String(places.length)} />
        <View style={styles.divider} />
        <Stat label="Laps" value={String(totalLaps)} />
      </View>

      {brands.length > 0 && (
        <>
          <Text style={styles.h2}>Collections</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
            {brands.map((b) => {
              const tier = tierFor(b.laps);
              return (
                <View key={b.brand} style={[styles.card, shadow, styles.brand]}>
                  <View style={[styles.medal, { borderColor: tier?.color ?? UI.line }]}><Text style={{ fontSize: 26 }}>{b.emoji}</Text></View>
                  <Text style={styles.brandName} numberOfLines={1}>{b.brand}</Text>
                  <Text style={[styles.tier, { color: tier?.color ?? UI.sub }]}>{tier?.name ?? '—'}</Text>
                  <Text style={styles.sub}>{b.locations} {b.locations === 1 ? 'location' : 'locations'}</Text>
                </View>
              );
            })}
          </ScrollView>
        </>
      )}

      <Text style={styles.h2}>Places</Text>
      {places.length === 0 ? (
        <View style={[styles.card, shadow, { alignItems: 'center', paddingVertical: 28 }]}>
          <MaterialIcons name="emoji-events" size={40} color={UI.faint} />
          <Text style={[styles.title, { marginTop: 10 }]}>No badges yet</Text>
          <Text style={[styles.sub, { textAlign: 'center', marginTop: 4, lineHeight: 19 }]}>
            Pick a spot on the map, like a café, a park or your school, and walk a full loop around it.
          </Text>
          <View style={styles.tiers}>
            {[1, 2, 3, 4, 5].map((lv) => (
              <View key={lv} style={styles.tierChip}>
                <View style={[styles.tierDot, { backgroundColor: CONFIG.LEVEL_COLORS[lv - 1] }]} />
                <Text style={styles.tierChipText}>Level {lv} · {lapsForLevel(lv)} {lv === 1 ? 'lap' : 'laps'}</Text>
              </View>
            ))}
            <View style={styles.tierChip}><Text style={styles.tierChipText}>and up…</Text></View>
          </View>
        </View>
      ) : (
        <View style={[styles.card, shadow, { paddingVertical: 6 }]}>
          {places.map((p, i) => {
            const tier = tierFor(p.laps);
            const next = nextTier(p.laps);
            const prevAt = tier?.laps ?? 0;
            const pct = (p.laps - prevAt) / (next.laps - prevAt);
            return (
              <View key={p.placeId} style={[styles.placeRow, i > 0 && styles.sep]}>
                <View style={[styles.medalSm, { borderColor: tier?.color ?? UI.line }]}><Text style={{ fontSize: 20 }}>{p.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text style={styles.title} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.tier, { color: tier?.color }]}>{tier?.name}</Text>
                  </View>
                  <Text style={styles.sub}>
                    {p.laps} {p.laps === 1 ? 'lap' : 'laps'}{` · ${next.laps - p.laps} more for ${next.name}`}
                  </Text>
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: next.color }]} /></View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pressable
        style={styles.reset}
        onPress={() => Alert.alert('Reset everything?', 'This clears your land and badges on this device.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: () => actions.resetWorld() },
        ])}>
        <Text style={{ color: UI.bad, fontWeight: '600' }}>Reset progress</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  h1: { color: UI.text, fontSize: 34, fontWeight: '800' },
  lead: { color: UI.sub, fontSize: 15, marginTop: 6, marginBottom: 20, lineHeight: 21 },
  h2: { color: UI.text, fontSize: 20, fontWeight: '700', marginTop: 28, marginBottom: 12 },
  card: { backgroundColor: UI.card, borderRadius: UI.radius, padding: 16 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: UI.line },
  statValue: { color: UI.text, fontSize: 22, fontWeight: '700' },
  statLabel: { color: UI.sub, fontSize: 12, marginTop: 2 },
  brand: { width: 130, alignItems: 'center', marginBottom: 6 },
  medal: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  brandName: { color: UI.text, fontWeight: '700', fontSize: 14, marginTop: 10 },
  title: { color: UI.text, fontWeight: '600', fontSize: 16, flexShrink: 1 },
  tier: { fontWeight: '700', fontSize: 13 },
  sub: { color: UI.sub, fontSize: 13, marginTop: 2 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  tierChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: UI.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  tierChipText: { color: UI.sub, fontSize: 12, fontWeight: '600' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: UI.line },
  medalSm: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  bar: { height: 5, backgroundColor: UI.bg, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  reset: { alignSelf: 'center', marginTop: 32, padding: 10 },
});
