import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameMap, camera } from '@/components/map/GameMap';
import { UI, shadow } from '@/constants/ui';
import { lapProgress, nextTier, tierFor } from '@/game/badges';
import { CONFIG } from '@/game/config';
import { areaOf, ownerAt } from '@/game/engine';
import { distance } from '@/game/geo';
import { Place, SearchResult, searchPlaces } from '@/game/places';
import { MapMode, actions, fmtArea, myStatus, nearbyPlaces, useGame } from '@/game/store';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [placesOpen, setPlacesOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const s = useGame((x) => x);
  const me = s.world.players[s.meId];
  const latestToast = s.feed[s.feed.length - 1];
  const selected = s.selectedPlaceId ? s.places[s.selectedPlaceId] : null;

  return (
    <View style={styles.root}>
      <GameMap />

      {/* Top: status, then the latest event */}
      <View style={[styles.top, { top: insets.top + 10 }]} pointerEvents="box-none">
        <StatusChip />
        {latestToast && (
          <View key={latestToast.id} style={[styles.toast, shadow]} pointerEvents="none">
            <View style={[styles.toastBar, { backgroundColor: toneColor[latestToast.tone] }]} />
            <Text style={styles.toastText}>{latestToast.text}</Text>
          </View>
        )}
        {s.target && !latestToast && (
          <Pressable style={[styles.targetChip, shadow]} onPress={() => actions.setTarget(null)}>
            <MaterialIcons name="flag" size={15} color={UI.accent} />
            <Text style={styles.targetText} numberOfLines={1}>
              {s.target.name}{me?.pos ? ` · ${fmtDist(distance(me.pos, [s.target.lng, s.target.lat]))}` : ''}
            </Text>
            <MaterialIcons name="close" size={15} color={UI.sub} />
          </Pressable>
        )}
      </View>

      {/* Right: map controls */}
      <View style={[styles.controls, { top: insets.top + 10 }]}>
        <RoundButton icon="layers" onPress={() => setLayersOpen((v) => !v)} active={layersOpen} />
        <RoundButton
          icon={s.follow ? 'my-location' : 'location-searching'}
          color={s.follow ? UI.accent : UI.text}
          onPress={() => { camera.recenter(); actions.setFollow(true); }}
        />
      </View>
      {layersOpen && <LayersMenu top={insets.top + 10} onClose={() => setLayersOpen(false)} />}

      {/* Bottom */}
      <View
        style={styles.bottom}
        pointerEvents="box-none"
        onLayout={(e) => camera.padding(insets.top + 60, e.nativeEvent.layout.height + 20)}>
        {s.sim.on && <SimBar />}
        {selected ? <PlaceCard place={selected} /> : (
          <View style={[styles.card, styles.statsCard, shadow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Your land</Text>
              <Text style={styles.big}>{fmtArea(me ? areaOf(me) : 0)}</Text>
              <Text style={styles.sub}>
                {Object.keys(s.badges.places).length} badges · {Object.values(s.badges.places).reduce((n, b) => n + b.laps, 0)} laps
              </Text>
            </View>
            <ActionButton icon="search" label="Places" onPress={() => setPlacesOpen(true)} />
            <ActionButton icon="directions-walk" label="Simulate" onPress={actions.toggleSim} active={s.sim.on} />
          </View>
        )}
      </View>

      <PlacesSheet visible={placesOpen} onClose={() => setPlacesOpen(false)} />
    </View>
  );
}

function StatusChip() {
  const s = useGame((x) => x);
  const st = myStatus(s);
  let text = 'Finding your location…';
  let icon: IconName = 'gps-not-fixed';
  let color = UI.sub;
  if (s.gps.status === 'denied' && !s.sim.on) { text = 'Location is off'; icon = 'location-disabled'; color = UI.bad; }
  else if (s.sim.on && !st?.hasPos) { text = 'Tap the map to start walking'; icon = 'touch-app'; color = UI.accent; }
  else if (st?.hasPos) {
    if (st.tooFast) { text = 'Too fast — slow down to a walk'; icon = 'directions-car'; color = UI.bad; }
    else if (st.trailM > 0) { text = `Drawing ${Math.round(st.trailM)} m · head back to your land`; icon = 'gesture'; color = UI.accent; }
    else if (st.inside) { text = 'In your land'; icon = 'home'; color = UI.good; }
    else { text = 'Walking'; icon = 'directions-walk'; color = UI.good; }
  }
  return (
    <View style={[styles.status, shadow]}>
      <MaterialIcons name={icon} size={16} color={color} />
      <Text style={styles.statusText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function RoundButton({ icon, onPress, active, color }: { icon: IconName; onPress: () => void; active?: boolean; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.round, shadow, active && { backgroundColor: UI.accentSoft }, pressed && { opacity: 0.7 }]}>
      <MaterialIcons name={icon} size={22} color={color ?? (active ? UI.accent : UI.text)} />
    </Pressable>
  );
}

function ActionButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <View style={[styles.actionIcon, active && { backgroundColor: UI.accent }]}>
        <MaterialIcons name={icon} size={22} color={active ? '#fff' : UI.accent} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const LAYERS: { mode: MapMode; icon: IconName; label: string }[] = [
  { mode: 'street', icon: 'map', label: 'Map' },
  { mode: 'gods', icon: 'satellite-alt', label: "God's Eye" },
  { mode: 'tilt', icon: 'location-city', label: '3D' },
];

function LayersMenu({ top, onClose }: { top: number; onClose: () => void }) {
  const mode = useGame((s) => s.mode);
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.layers, shadow, { top }]}>
        <Text style={[styles.label, { marginBottom: 10 }]}>Map view</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {LAYERS.map((l) => {
            const on = mode === l.mode;
            return (
              <Pressable key={l.mode} style={styles.layer} onPress={() => { actions.setMode(l.mode); onClose(); }}>
                <View style={[styles.layerIcon, on && { borderColor: UI.accent, backgroundColor: UI.accentSoft }]}>
                  <MaterialIcons name={l.icon} size={24} color={on ? UI.accent : UI.sub} />
                </View>
                <Text style={[styles.layerLabel, on && { color: UI.accent }]}>{l.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

function SimBar() {
  const turbo = useGame((s) => s.sim.turbo);
  return (
    <View style={[styles.simBar, shadow]}>
      <MaterialIcons name="science" size={16} color={UI.gold} />
      <Text style={styles.simText}>Simulating · tap map to walk</Text>
      {[1, 4, 10].map((t) => (
        <Pressable key={t} onPress={() => actions.setTurbo(t)} style={[styles.chip, turbo === t && styles.chipOn]}>
          <Text style={[styles.chipText, turbo === t && { color: '#fff' }]}>{t}×</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const s = useGame((x) => x);
  const badge = s.badges.places[place.id];
  const laps = badge?.laps ?? 0;
  const tier = tierFor(laps);
  const next = nextTier(laps);
  const owner = ownerAt(s.world, [place.lng, place.lat]);
  const prog = lapProgress(s.badges, place.id);
  const me = s.world.players[s.meId];
  const d = me?.pos ? distance(me.pos, [place.lng, place.lat]) : null;
  const isTarget = s.target?.id === place.id;
  return (
    <View style={[styles.card, shadow]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.placeIcon, { borderColor: tier?.color ?? UI.line }]}>
          <Text style={{ fontSize: 24 }}>{place.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{place.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {place.category.replace(/_/g, ' ')}{d != null ? ` · ${fmtDist(d)}` : ''}
            {owner?.id === s.meId ? ' · in your land' : ''}
          </Text>
        </View>
        <Pressable onPress={() => actions.selectPlace(null)} hitSlop={12} style={styles.closeBtn}>
          <MaterialIcons name="close" size={18} color={UI.sub} />
        </Pressable>
      </View>

      <View style={styles.badgeRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tierText, { color: tier?.color ?? UI.sub }]}>{tier ? `${tier.name} badge` : 'No badge yet'}</Text>
          <Text style={styles.sub}>
            {laps} {laps === 1 ? 'lap' : 'laps'}{next ? ` · ${next.laps - laps} more for ${next.name}` : ' · max level'}
          </Text>
        </View>
        {prog > 0 && <Text style={styles.progText}>{Math.round(prog * 100)}%</Text>}
      </View>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${prog * 100}%` }]} /></View>
      <Text style={styles.hint}>Walk all the way around it, staying within {CONFIG.LAP_MAX_RADIUS_M} m, to count a lap.</Text>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable
          style={[styles.primary, isTarget && styles.secondary]}
          onPress={() => actions.setTarget(isTarget ? null : place)}>
          <MaterialIcons name={isTarget ? 'flag' : 'outlined-flag'} size={18} color={isTarget ? UI.accent : '#fff'} />
          <Text style={[styles.primaryText, isTarget && { color: UI.accent }]}>{isTarget ? 'Targeted' : 'Set as target'}</Text>
        </Pressable>
        {s.sim.on && (
          <Pressable style={[styles.primary, styles.secondary]} onPress={() => actions.simLap(place)}>
            <MaterialIcons name="replay" size={18} color={UI.accent} />
            <Text style={[styles.primaryText, { color: UI.accent }]}>Simulate lap</Text>
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
            <MaterialIcons name="search" size={20} color={UI.faint} />
            <TextInput
              value={q} onChangeText={(t) => { setQ(t); if (!t) setResults(null); }} onSubmitEditing={run} returnKeyType="search"
              placeholder="Search for a place" placeholderTextColor={UI.faint} style={styles.searchInput}
            />
            {busy && <ActivityIndicator color={UI.accent} />}
          </View>
          {err && <Text style={{ color: UI.bad, marginBottom: 8 }}>{err}</Text>}
          <Text style={[styles.label, { marginTop: 6, marginBottom: 4 }]}>{results ? 'Results' : 'Nearby'}</Text>
          <FlatList
            data={list}
            keyExtractor={(p) => p.id}
            style={{ maxHeight: 440 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.sub, { paddingVertical: 20 }]}>{results ? 'Nothing found.' : 'Places show up here as the map loads around you.'}</Text>}
            renderItem={({ item }) => {
              const b = s.badges.places[item.id];
              const tier = b ? tierFor(b.laps) : null;
              const dist = item.dist ?? (me?.pos ? distance(me.pos, [item.lng, item.lat]) : null);
              return (
                <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: UI.bg }]} onPress={() => pick(item)}>
                  <View style={[styles.rowIcon, { borderColor: tier?.color ?? UI.line }]}><Text style={{ fontSize: 18 }}>{item.emoji}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.address || item.category.replace(/_/g, ' ')}{dist != null ? ` · ${fmtDist(dist)}` : ''}
                    </Text>
                  </View>
                  {tier && <Text style={[styles.tierText, { color: tier.color, fontSize: 12 }]}>{tier.name}</Text>}
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const toneColor = { good: UI.good, bad: UI.bad, gold: UI.gold, info: UI.accent };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  top: { position: 'absolute', left: 16, right: 72, alignItems: 'flex-start', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: UI.card, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  statusText: { color: UI.text, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  toast: { flexDirection: 'row', alignItems: 'center', backgroundColor: UI.card, borderRadius: 14, paddingRight: 14, overflow: 'hidden', maxWidth: '100%' },
  toastBar: { width: 4, alignSelf: 'stretch', marginRight: 12 },
  toastText: { color: UI.text, fontWeight: '600', fontSize: 14, paddingVertical: 10, flexShrink: 1 },
  targetChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: UI.card, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  targetText: { color: UI.text, fontWeight: '600', fontSize: 13, flexShrink: 1 },

  controls: { position: 'absolute', right: 16, gap: 10 },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: UI.card, alignItems: 'center', justifyContent: 'center' },
  layers: { position: 'absolute', right: 72, backgroundColor: UI.card, borderRadius: UI.radius, padding: 16 },
  layer: { alignItems: 'center', width: 72 },
  layerIcon: { width: 56, height: 56, borderRadius: 14, borderWidth: 2, borderColor: UI.line, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  layerLabel: { marginTop: 6, fontSize: 12, fontWeight: '600', color: UI.sub },

  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 10 },
  card: { backgroundColor: UI.card, borderRadius: UI.radius + 4, padding: 18 },
  statsCard: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: UI.sub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  big: { color: UI.text, fontSize: 28, fontWeight: '700', marginTop: 2 },
  sub: { color: UI.sub, fontSize: 13, marginTop: 2 },
  action: { alignItems: 'center', width: 70 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: UI.accentSoft, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: UI.sub, fontSize: 11, fontWeight: '600', marginTop: 5 },

  simBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fffaf0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'stretch' },
  simText: { color: '#7c5a10', fontWeight: '600', fontSize: 13, flex: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: '#f3e7cc' },
  chipOn: { backgroundColor: UI.gold },
  chipText: { color: '#7c5a10', fontWeight: '700', fontSize: 12 },

  title: { color: UI.text, fontSize: 19, fontWeight: '700' },
  placeIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: UI.bg, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18 },
  tierText: { fontWeight: '700', fontSize: 15 },
  progText: { color: UI.accent, fontWeight: '700' },
  bar: { height: 6, backgroundColor: UI.bg, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: UI.accent, borderRadius: 3 },
  hint: { color: UI.faint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  primary: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.accent, paddingVertical: 13, borderRadius: 14 },
  secondary: { backgroundColor: UI.accentSoft },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: UI.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: UI.line, alignSelf: 'center', marginBottom: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: UI.bg, borderRadius: 14, paddingHorizontal: 12, marginBottom: 8 },
  searchInput: { flex: 1, color: UI.text, height: 46, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: UI.bg },
  rowTitle: { color: UI.text, fontWeight: '600', fontSize: 16 },
});
