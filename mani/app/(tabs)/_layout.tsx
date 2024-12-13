import { HapticTab } from 'components/HapticTab'
import { IconSymbol } from 'components/ui/IconSymbol'
import TabBarBackground from 'components/ui/TabBarBackground'
import { Tabs } from 'expo-router'
import { useColor } from 'hooks/useColor'
import React from 'react'
import { Platform } from 'react-native'

export default function TabLayout() {
  const color = useColor()

  const commonTabBarStyle = {
    backgroundColor: color.background,
    borderTopWidth: 1, // Remove top border
    shadowOpacity: 0, // Remove shadow
    borderTopColor: color.border,
    paddingTop: 4,
  }

  const iosSpecificStyle = {
    position: 'absolute',
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: color.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            ...commonTabBarStyle,
            ...iosSpecificStyle,
          },
          default: commonTabBarStyle,
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          // tabBarIcon: ({ color }) => (
          //   <IconSymbol
          //     size={28}
          //     name="chart.line.uptrend.xyaxis"
          //     color={color}
          //   />
          // ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Inga',
          // tabBarIcon: ({ color }) => (
          //   <IconSymbol size={28} name="paperplane.fill" color={color} />
          // ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          // tabBarIcon: ({ color }) => (
          //   <IconSymbol size={28} name="bell" color={color} />
          // ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          // tabBarIcon: ({ color }) => (
          //   <IconSymbol size={28} name="bag" color={color} />
          // ),
        }}
      />
    </Tabs>
  )
}
