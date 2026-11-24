import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/AuthContext';
import { useByUid } from './src/hooks';
import { expireBooking } from './src/api';
import { toList, nowSec, GRACE_MIN } from './src/utils';
import { TabShell, C } from './src/ui';
import AuthScreen from './src/screens/AuthScreen';
import SlotsScreen from './src/screens/driver/SlotsScreen';
import MyBookingsScreen from './src/screens/driver/MyBookingsScreen';
import DashboardScreen from './src/screens/admin/DashboardScreen';
import SessionsScreen from './src/screens/admin/SessionsScreen';

function DriverApp() {
  const { user, profile, logout } = useAuth();
  const mine = useByUid('bookings', user.uid);

  // Release bookings whose grace period passed so the time window frees up for others.
  useEffect(() => {
    const t = nowSec();
    toList(mine).forEach((b) => {
      if (b.status === 'confirmed' && t > b.startSec + GRACE_MIN * 60) expireBooking(b).catch(() => {});
    });
  }, [mine]);

  return (
    <TabShell
      title="Smart Parking"
      subtitle={`${profile.name}${profile.vehicle ? ' · ' + profile.vehicle : ''}`}
      onLogout={logout}
      tabs={[
        { key: 'book', label: 'Book a slot', render: () => <SlotsScreen /> },
        { key: 'mine', label: 'My parking', render: () => <MyBookingsScreen /> },
      ]}
    />
  );
}

function AdminApp() {
  const { profile, logout } = useAuth();
  return (
    <TabShell
      title="Parking admin"
      subtitle={profile.name}
      onLogout={logout}
      tabs={[
        { key: 'live', label: 'Live', render: () => <DashboardScreen /> },
        { key: 'sessions', label: 'Parking history', render: () => <SessionsScreen /> },
      ]}
    />
  );
}

function Root() {
  const { user, profile, loading, isAdmin } = useAuth();
  if (loading) return <Center><ActivityIndicator size="large" color={C.asphalt} /></Center>;
  if (!user) return <AuthScreen />;
  if (!profile) return <Center><Text>Setting up your account…</Text></Center>;
  return isAdmin ? <AdminApp /> : <DriverApp />;
}

const Center = ({ children }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>{children}</View>
);

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Root />
    </AuthProvider>
  );
}
