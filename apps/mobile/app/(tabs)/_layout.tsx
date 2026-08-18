import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#168FA8',
        tabBarInactiveTintColor: '#7B8798',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#DCE3E8',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: '#168FA8',
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 17,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerTitle: 'RDIP Mobile — Operations',
        }}
      />
      <Tabs.Screen
        name="integrations"
        options={{
          title: 'Integrations',
          headerTitle: 'Integrations Catalog',
        }}
      />
      <Tabs.Screen
        name="pipelines"
        options={{
          title: 'Pipelines',
          headerTitle: 'Pipeline Monitor',
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          headerTitle: 'Attention Queue',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'Institution & Role',
        }}
      />
    </Tabs>
  );
}
