import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: '#00f0ff',
        tabBarInactiveTintColor: '#6b7385',
        tabBarStyle: { backgroundColor: '#0e1118', borderTopColor: '#1d2230' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Map', tabBarIcon: ({ color }) => <IconSymbol size={26} name="map.fill" color={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Badges', tabBarIcon: ({ color }) => <IconSymbol size={26} name="trophy.fill" color={color} /> }}
      />
    </Tabs>
  );
}
