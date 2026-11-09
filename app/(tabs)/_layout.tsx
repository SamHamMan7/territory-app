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
        tabBarActiveTintColor: '#2b7cff',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e5e7eb' },
        tabBarLabelStyle: { fontWeight: '600' },
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
