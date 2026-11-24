import React, { useState } from 'react';
import { View, Text, Alert, SafeAreaView, ScrollView } from 'react-native';
import { useAuth } from '../AuthContext';
import { Btn, Field, C, Muted } from '../ui';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', vehicle: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.email || !f.password) return Alert.alert('Missing details', 'Enter your email and password.');
    if (mode === 'signup' && (!f.name || !f.vehicle)) return Alert.alert('Missing details', 'Enter your name and vehicle number.');
    setBusy(true);
    try {
      if (mode === 'login') await signIn(f.email, f.password);
      else await signUp(f);
    } catch (e) {
      Alert.alert(mode === 'login' ? 'Could not log in' : 'Could not sign up', e.message.replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.asphalt }}>
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800' }}>Smart Parking</Text>
        <View style={{ height: 4, width: 56, backgroundColor: C.paint, marginVertical: 10 }} />
        <Muted style={{ color: '#aab2bf', marginBottom: 24 }}>
          {mode === 'login' ? 'Log in to book a slot or manage your lot.' : 'Create a driver account to book slots.'}
        </Muted>
        {mode === 'signup' && (
          <>
            <Field placeholder="Full name" autoCapitalize="words" value={f.name} onChangeText={set('name')} />
            <Field placeholder="Vehicle number (e.g. DL 1C AB 1234)" autoCapitalize="characters" value={f.vehicle} onChangeText={set('vehicle')} />
          </>
        )}
        <Field placeholder="Email" keyboardType="email-address" value={f.email} onChangeText={set('email')} />
        <Field placeholder="Password" secureTextEntry value={f.password} onChangeText={set('password')} />
        <Btn title={mode === 'login' ? 'Log in' : 'Create account'} onPress={submit} busy={busy} style={{ backgroundColor: C.paint }} />
        <Btn
          kind="ghost"
          style={{ marginTop: 10, borderColor: '#475060' }}
          title={mode === 'login' ? 'New driver? Sign up' : 'Have an account? Log in'}
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
