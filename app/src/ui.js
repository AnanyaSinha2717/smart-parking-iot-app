import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, TextInput,
  Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SLOT_LAYOUT, ROW_LABELS } from './utils';

// Design tokens: asphalt + road-paint yellow, with traffic-style status colours.
export const C = {
  bg: '#eceef0', card: '#ffffff', ink: '#14181f', sub: '#667085', line: '#d9dde3',
  asphalt: '#232830', paint: '#f2b705',
  free: '#1f9d62', booked: '#d98a00', occupied: '#d6453d', mine: '#2563eb',
};
const SLOT_COLOR = { free: C.free, booked: C.booked, occupied: C.occupied, mine: C.mine };
const SLOT_TEXT = { free: 'Free', booked: 'Booked', occupied: 'Taken', mine: 'Yours' };
export const STATUS_COLOR = {
  confirmed: C.mine, arrived: C.booked, checked_in: C.free,
  completed: C.sub, cancelled: C.occupied, expired: C.occupied,
};

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;
export const H = ({ children }) => <Text style={s.h}>{children}</Text>;
export const Muted = ({ children, style }) => <Text style={[s.muted, style]}>{children}</Text>;
export const Row = ({ children, style }) => <View style={[s.row, style]}>{children}</View>;

export function Btn({ title, onPress, kind = 'primary', disabled, busy, style }) {
  const bg = kind === 'danger' ? C.occupied : kind === 'ghost' ? 'transparent' : C.asphalt;
  const fg = kind === 'ghost' ? C.ink : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, kind === 'ghost' && s.btnGhost, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export const Chip = ({ label, active, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipOn]}>
    <Text style={[s.chipText, active && { color: C.ink, fontWeight: '700' }]}>{label}</Text>
  </TouchableOpacity>
);

export const Badge = ({ label, color }) => (
  <View style={[s.badge, { backgroundColor: color }]}>
    <Text style={s.badgeText}>{String(label).replace('_', ' ')}</Text>
  </View>
);

export const Field = (props) => (
  <TextInput placeholderTextColor="#98a2b3" autoCapitalize="none" {...props} style={[s.input, props.style]} />
);

export const Screen = ({ children }) => (
  <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
    {children}
  </ScrollView>
);

export function Legend({ items = ['free', 'booked', 'occupied'] }) {
  return (
    <Row style={{ justifyContent: 'center', marginTop: 10 }}>
      {items.map((k) => (
        <Row key={k} style={{ marginHorizontal: 8 }}>
          <View style={[s.dot, { backgroundColor: SLOT_COLOR[k] }]} />
          <Muted style={{ marginLeft: 6 }}>{SLOT_TEXT[k]}</Muted>
        </Row>
      ))}
    </Row>
  );
}

// Two rows of three bays, laid out like the LCD grid and the physical model.
export function SlotGrid({ states, onPress }) {
  return (
    <View style={s.lot}>
      {SLOT_LAYOUT.map((row, ri) => (
        <View key={ri} style={s.lotRow}>
          <Text style={s.level}>{ROW_LABELS[ri]}</Text>
          {row.map((n) => {
            const st = states[n] || 'free';
            return (
              <TouchableOpacity
                key={n}
                disabled={!onPress}
                onPress={() => onPress(n, st)}
                style={[s.bay, { backgroundColor: SLOT_COLOR[st] }]}
              >
                <Text style={s.bayNo}>{n}</Text>
                <Text style={s.bayState}>{SLOT_TEXT[st]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function TabShell({ title, subtitle, tabs, onLogout }) {
  const [active, setActive] = useState(tabs[0].key);
  const cur = tabs.find((t) => t.key === active);
  return (
    <SafeAreaView style={[s.shell, { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        </View>
        <TouchableOpacity onPress={onLogout}><Text style={s.logout}>Log out</Text></TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>{cur.render()}</View>
      <View style={s.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} style={s.tab} onPress={() => setActive(t.key)}>
            <View style={[s.tabBar, active === t.key && { backgroundColor: C.paint }]} />
            <Text style={[s.tabText, active === t.key && { color: C.ink, fontWeight: '700' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.asphalt, flexDirection: 'row', alignItems: 'center', padding: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#aab2bf', fontSize: 13, marginTop: 2 },
  logout: { color: C.paint, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.line },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 12 },
  tabBar: { height: 4, alignSelf: 'stretch', backgroundColor: 'transparent', marginBottom: 10 },
  tabText: { color: C.sub, fontSize: 14 },
  card: { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  h: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 8 },
  muted: { color: C.sub, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnGhost: { borderWidth: 1, borderColor: C.line },
  btnText: { fontWeight: '700', fontSize: 15 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', marginRight: 8, marginBottom: 8 },
  chipOn: { backgroundColor: C.paint, borderColor: C.paint },
  chipText: { color: C.sub },
  badge: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff', marginBottom: 10, color: C.ink },
  dot: { width: 12, height: 12, borderRadius: 6 },
  lot: { backgroundColor: C.asphalt, borderRadius: 10, padding: 12 },
  lotRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  level: { color: '#aab2bf', fontWeight: '700', width: 28 },
  bay: {
    flex: 1, height: 84, marginHorizontal: 5, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderStyle: 'dashed',
  },
  bayNo: { color: '#fff', fontSize: 26, fontWeight: '800' },
  bayState: { color: '#fff', fontSize: 12 },
});
