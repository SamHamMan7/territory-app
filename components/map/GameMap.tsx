import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { buildMapMessage } from '@/game/render';
import { actions, gameNow, getState, nearbyPlaces, subscribe, useGame } from '@/game/store';
import { mapHtml } from './mapHtml';

/** MapLibre map in a WebView, kept in sync with the game store. */
export const GameMap = React.memo(function GameMap() {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = useGame((s) => s.mode);

  // Push world state to the map, throttled to ~3 fps.
  useEffect(() => {
    if (!ready) return;
    let pending = true;
    const push = () => {
      if (!pending) return;
      pending = false;
      const s = getState();
      const msg = buildMapMessage({
        world: s.world, meId: s.meId, places: nearbyPlaces(s, 120), badges: s.badges,
        target: s.target, heading: s.heading, now: gameNow(),
      });
      ref.current?.injectJavaScript(`window.__recv && window.__recv(${JSON.stringify(msg)});true;`);
    };
    push();
    const unsub = subscribe(() => { pending = true; });
    const t = setInterval(push, 330);
    return () => { unsub(); clearInterval(t); };
  }, [ready]);

  useEffect(() => {
    if (ready) send({ type: 'mode', mode });
  }, [mode, ready]);

  // Let other components drive the camera.
  useEffect(() => {
    cameraBus = (m) => send(m);
    return () => { cameraBus = null; };
  });

  function send(m: object) {
    ref.current?.injectJavaScript(`window.__recv && window.__recv(${JSON.stringify(m)});true;`);
  }

  function onMessage(e: WebViewMessageEvent) {
    let m: any;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (m.type) {
      case 'ready':
        setReady(true); setError(null);
        if (lastPadding) send({ type: 'padding', ...lastPadding });
        break;
      case 'tap': actions.simTap(m.lng, m.lat); actions.selectPlace(null); break;
      case 'poi': actions.selectPlace(m.id); break;
      case 'pois': actions.addTilePlaces(m.items); break;
      case 'follow': actions.setFollow(m.on); break;
      case 'error': console.warn('[map]', m.msg); if (/failed to load/i.test(m.msg)) setError(m.msg); break;
    }
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={ref}
        source={SOURCE}
        originWhitelist={ORIGINS}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        style={styles.web}
        containerStyle={styles.web}
        overScrollMode="never"
        bounces={false}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
      />
      {error && (
        <View style={styles.err}><Text style={styles.errText}>{error}</Text></View>
      )}
    </View>
  );
});

const SOURCE = { html: mapHtml, baseUrl: 'https://territory.app/' };
const ORIGINS = ['*'];

let cameraBus: ((m: object) => void) | null = null;
let lastPadding: { top: number; bottom: number } | null = null;
export const camera = {
  recenter: () => cameraBus?.({ type: 'recenter' }),
  flyTo: (lng: number, lat: number, zoom = 17) => cameraBus?.({ type: 'flyTo', lng, lat, zoom }),
  /** Keep the map's focus clear of overlaid UI (and keep the OSM credit visible). */
  padding: (top: number, bottom: number) => { lastPadding = { top, bottom }; cameraBus?.({ type: 'padding', top, bottom }); },
};

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#f2efe9' },
  err: { position: 'absolute', top: '45%', alignSelf: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 12 },
  errText: { color: '#e11d48', fontWeight: '600' },
});
