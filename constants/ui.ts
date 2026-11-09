// Shared look for the game UI: light, map-app style.
import { Platform } from 'react-native';

export const UI = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#111827',
  sub: '#6b7280',
  faint: '#9ca3af',
  line: '#e5e7eb',
  accent: '#2b7cff',
  accentSoft: '#e8f0ff',
  good: '#16a34a',
  bad: '#e11d48',
  gold: '#b7791f',
  radius: 18,
};

export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 6 },
  default: { boxShadow: '0 4px 14px rgba(0,0,0,.14)' } as object,
});
