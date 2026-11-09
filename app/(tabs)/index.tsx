import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameMap, camera } from '@/components/map/GameMap';
import { lapProgress, nextTier, tierFor } from '@/game/badges';
import { CONFIG } from '@/game/config';
import { ownerAt } from '@/game/engine';
import { distance } from '@/game/geo';
import { Place, SearchResult, searchPlaces } from '@/game/places';
import { MapMode, actions, fmtArea, leaderboard, myStatus, nearbyPlaces, useGame } from '@/game/store';

const C = { bg: 'rgba(14,17,24,0.92)', line: '#262c3a', text: '#eef2ff', dim: '#8a93a8', accent: '#00f0ff' };

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [placesOpen, setPlacesOpen] = useState(false);
  const s = useGame((x) => x); // whole state; new object on every game tick
  const status = myStatus(s);
  const board = leaderboard(s);
  const myRank = board.findIndex((b) => b.isMe) + 1;
  const myArea = board.find((b) => b.isMe)?.area ?? 0;

  return (
    <View style={styles.root}>
      <GameMap />

      {/* Status + feed */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <StatusPill />
        <View style={{ gap: 6, marginTop: 8 }} pointerEvents="none">
          {s.feed.map((f) => (
            <View key={f.id} style={[styles.toast, toneStyle[f.tone]]}>
              <Text style={styles.toastText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Map mode + recenter */}
      <View style={[styles.side, { top: insets.top + 8 }]}>
        <ModeButton mode="street" icon="🗺️" label="Street" />
        <ModeButton mode="gods" icon="🛰️" label="God's Eye" />
        <ModeButton mode="tilt" icon="🏙️" label="3D" />
        {!s.follow && (
          <Pressable style={[styles.sideBtn, { marginTop: 10 }]} onPress={() => { camera.recenter(); actions.setFollow(true); }}>
            <Text style={styles.sideIcon}>🎯</Text>
          </Pressable>
        )}
      </View>

      {s.target && (
        <Pressable style={[styles.targetPill, { top: insets.top + 60 }]} onPress={() => actions.setTarget(null)}>
          <Text style={styles.targetText}>
            {s.target.emoji} {s.target.name}
            {status?.hasPos ? ` · ${Math.round(distance(s.world.players[s.meId].pos!, [s.target.lng, s.target.lat]))} m` : ''}  ✕
          </Text>
        </Pressable>
      )}

      {/* Bottom HUD */}
      <View style={[styles.bottom, { bottom: 12 }]} pointerEvents="box-none">
        {s.sim.on && (
          <View style={styles.simBar}>
            <Text style={styles.simText}>🧪 Tap map to walk</Text>
            {[1, 4, 10].map((t) => (
              <Pressable key={t} onPress={() => actions.setTurbo(t)} style={[styles.chip, s.sim.turbo === t && styles.chipOn]}>
                <Text style={[styles.chipText, s.sim.turbo === t && { color: '#000' }]}>{t}×</Text>
              </Pressable>
            ))}
          </View>
        )}
        <SelectedPlaceCard />
        <View style={styles.hud}>
          <View style={[styles.swatch, { backgroundColor: status?.color ?? '#555' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hudLabel}>YOUR LAND</Text>
            <Text style={styles.hudValue}>{fmtArea(myArea)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
            <Text style={styles.hudLabel}>RANK</Text>
            <Text style={styles.hudValue}>#{myRank || '-'}<Text style={styles.hudDim}>/{board.length}</Text></Text>
          </View>
          <Pressable style={styles.hudBtn} onPress={() => setPlacesOpen(true)}>
            <Text style={styles.hudBtnText}>📍</Text>
          </Pressable>
          <Pressable style={[styles.hudBtn, s.sim.on && { backgroundColor: '#ffd23f' }]} onPress={actions.toggleSim}>
            <Text style={styles.hudBtnText}>🧪</Text>
          </Pressable>
        </View>
      </View>

      <PlacesSheet visible={placesOpen} onClose={() => setPlacesOpen(false)} />
    </View>
  );
}

function StatusPill() {
  const s = useGame((x) => x);
  const st = myStatus(s);
  let text = 'Waiting for GPS…';
  let dot = '#8a93a8';
  if (s.gps.status === 'denied' && !s.sim.on) { text = 'Location denied — enable it, or use 🧪 sim'; dot = '#ff5c7a'; }
  else if (s.sim.on && !st?.hasPos) { text = 'Sim: tap the map to drop in'; dot = '#ffd23f'; }
  else if (st?.hasPos) {
    const kmh = (st.speed * 3.6).toFixed(1);
    if (st.tooFast) { text = `🚗 Too fast (${kmh} km/h) — slow to a walk`; dot = '#ff5c7a'; }
    else if (st.trailM > 0) { text = `✏️ Drawing · ${Math.round(st.trailM)} m · get back to your land!`; dot = st.color; }
    else if (st.inside) { text = `🏠 In your land · walk out to draw`; dot = '#7cff6b'; }
    else { text = `🚶 ${kmh} km/h`; dot = '#7cff6b'; }
  }
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.pillText} numberOfLines={1}>{text}</Text>
      {s.gps.accuracy != null && !s.sim.on && <Text style={styles.pillDim}>±{Math.round(s.gps.accuracy)}m</Text>}
    </View>
  );
}

function ModeButton({ mode, icon, label }: { mode: MapMode; icon: string; label: string }) {
  const cur = useGame((s) => s.mode);
  const on = cur === mode;
  return (
    <Pressable onPress={() => actions.setMode(mode)} style={[styles.sideBtn, on && styles.sideBtnOn]} accessibilityLabel={label}>
      <Text style={styles.sideIcon}>{icon}</Text>
      <Text style={[styles.sideLabel, on && { color: '#000' }]}>{label}</Text>
    </Pressable>
  );
}

function SelectedPlaceCard() {
  const s = useGame((x) => x);
  const place = s.selectedPlaceId ? s.places[s.selectedPlaceId] : null;
  if (!place) return null;
  const badge = s.badges.places[place.id];
  const laps = badge?.laps ?? 0;
  const tier = tierFor(laps);
  const next = nextTier(laps);
  const holder = ownerAt(s.world, [place.lng, place.lat]);
  const prog = lapProgress(s.badges, place.id);
  const me = s.world.players[s.meId];
  const d = me?.pos ? distance(me.pos, [place.lng, place.lat]) : null;
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 30, marginRight: 10 }}>{place.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.cardSub}>
            {place.category.replace(/_/g, ' ')}{d != null ? ` · ${Math.round(d)} m away` : ''}
          </Text>
        </View>
        <Pressable onPress={() => actions.selectPlace(null)} hitSlop={12}><Text style={{ color: C.dim, fontSize: 18 }}>✕</Text></Pressable>
      </View>
      <View style={styles.cardRow}>
        <Text style={[styles.tier, { color: tier?.color ?? C.dim }]}>{tier ? `🏅 ${tier.name}` : 'No badge yet'}</Text>
        <Text style={styles.cardSub}>{laps} {laps === 1 ? 'lap' : 'laps'}{next ? ` · ${next.laps - laps} to ${next.name}` : ' · maxed!'}</Text>
      </View>
      {prog > 0 && (
        <View style={styles.bar}><View style={[styles.barFill, { width: `${prog * 100}%` }]} /></View>
      )}
      <Text style={styles.cardSub}>
        {holder ? `👑 Held by ${holder.id === s.meId ? 'you' : holder.name}` : 'Unclaimed — encircle it to hold it'}
        {'  ·  '}Walk all the way around (within {CONFIG.LAP_MAX_RADIUS_M} m) for a lap
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable style={styles.btn} onPress={() => { actions.setTarget(place); actions.selectPlace(null); }}>
          <Text style={styles.btnText}>🎯 Set target</Text>
        </Pressable>
        {s.sim.on && (
          <Pressable style={[styles.btn, { backgroundColor: '#2b2410' }]} onPress={() => actions.simLap(place)}>
            <Text style={[styles.btnText, { color: '#ffd23f' }]}>🧪 Sim a lap</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PlacesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = useGame((x) => x);
  const nearby = useMemo(() => (visible ? nearbyPlaces(s, 80) : []), [s, visible]);

  async function run() {
    if (!q.trim()) { setResults(null); return; }
    setBusy(true); setErr(null);
    try {
      const me = s.world.players[s.meId];
      setResults(await searchPlaces(q.trim(), me?.pos ? { lng: me.pos[0], lat: me.pos[1] } : null));
    } catch (e: any) { setErr(e.message ?? 'Search failed'); }
    setBusy(false);
  }

  function pick(p: Place) {
    actions.addPlace(p);
    actions.setTarget(p);
    actions.selectPlace(p.id);
    camera.flyTo(p.lng, p.lat);
    onClose();
  }

  const me = s.world.players[s.meId];
  const list: (Place & { dist?: number; address?: string })[] = results ?? nearby;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />
          <View style={styles.search}>
            <TextInput
              value={q} onChangeText={setQ} onSubmitEditing={run} returnKeyType="search"
              placeholder="Search places (e.g. McDonald's)" placeholderTextColor={C.dim} style={styles.searchInput}
            />
            {busy ? <ActivityIndicator color={C.accent} /> : (
              <Pressable onPress={run} hitSlop={10}><Text style={{ fontSize: 18 }}>🔍</Text></Pressable>
            )}
          </View>
          {err && <Text style={{ color: '#ff8fa3', marginBottom: 8 }}>{err}</Text>}
          <Text style={styles.sheetHeader}>{results ? 'Search results' : 'Nearby places'}</Text>
          <FlatList
            data={list}
            keyExtractor={(p) => p.id}
            style={{ maxHeight: 420 }}
            ListEmptyComponent={<Text style={styles.cardSub}>{results ? 'Nothing found.' : 'Places appear as the map loads around you.'}</Text>}
            renderItem={({ item }) => {
              const b = s.badges.places[item.id];
              const tier = b ? tierFor(b.laps) : null;
              const dist = item.dist ?? (me?.pos ? distance(me.pos, [item.lng, item.lat]) : null);
              return (
                <Pressable style={styles.row} onPress={() => pick(item)}>
                  <Text style={{ fontSize: 22, width: 34 }}>{item.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {item.address || item.category.replace(/_/g, ' ')}{dist != null ? ` · ${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km'}` : ''}
                    </Text>
                  </View>
                  {tier && <Text style={[styles.tier, { color: tier.color }]}>{tier.name} · {b!.laps}</Text>}
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const toneStyle = StyleSheet.create({
  good: { borderColor: '#2f7d4a' },
  bad: { borderColor: '#8a2b3d', backgroundColor: 'rgba(48,14,22,0.94)' },
  gold: { borderColor: '#b38a1a', backgroundColor: 'rgba(40,32,8,0.94)' },
  info: {},
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0d12' },
  top: { position: 'absolute', left: 12, right: 84 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: C.line, alignSelf: 'flex-start', maxWidth: '100%' },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  pillText: { color: C.text, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  pillDim: { color: C.dim, fontSize: 11, marginLeft: 8 },
  toast: { backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.line, alignSelf: 'flex-start' },
  toastText: { color: C.text, fontWeight: '700', fontSize: 13 },

  side: { position: 'absolute', right: 12, alignItems: 'center', gap: 8 },
  sideBtn: { width: 62, paddingVertical: 7, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  sideBtnOn: { backgroundColor: C.accent, borderColor: C.accent },
  sideIcon: { fontSize: 18 },
  sideLabel: { color: C.dim, fontSize: 9, fontWeight: '700', marginTop: 2 },

  targetPill: { position: 'absolute', left: 12, backgroundColor: '#00f0ff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  targetText: { color: '#001418', fontWeight: '800', fontSize: 12 },

  bottom: { position: 'absolute', left: 12, right: 12, gap: 8 },
  hud: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: C.line },
  swatch: { width: 6, alignSelf: 'stretch', borderRadius: 3, marginRight: 12 },
  hudLabel: { color: C.dim, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  hudValue: { color: C.text, fontSize: 20, fontWeight: '800' },
  hudDim: { color: C.dim, fontSize: 14 },
  hudBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1d2230', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  hudBtnText: { fontSize: 20 },

  simBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(40,32,8,0.94)', borderRadius: 14, padding: 8, gap: 6, borderWidth: 1, borderColor: '#5c4a12' },
  simText: { color: '#ffd23f', fontWeight: '700', flex: 1, marginLeft: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#5c4a12' },
  chipOn: { backgroundColor: '#ffd23f' },
  chipText: { color: '#ffd23f', fontWeight: '800' },

  card: { backgroundColor: C.bg, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  cardSub: { color: C.dim, fontSize: 12, marginTop: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 },
  tier: { fontWeight: '800', fontSize: 13 },
  bar: { height: 6, backgroundColor: '#1d2230', borderRadius: 3, marginVertical: 8, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: C.accent },
  btn: { flex: 1, backgroundColor: '#0f2a30', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  btnText: { color: C.accent, fontWeight: '800' },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#11141c', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, borderColor: C.line, borderWidth: 1 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#333a4a', alignSelf: 'center', marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1f2b', borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, color: C.text, height: 44 },
  sheetHeader: { color: C.dim, fontWeight: '800', fontSize: 11, letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  rowTitle: { color: C.text, fontWeight: '700', fontSize: 15 },
});
