import React, { useState } from 'react';
import { Text, Alert } from 'react-native';
import { useValue, useNow } from '../../hooks';
import { setRate } from '../../api';
import { Screen, Card, H, Muted, Row, Btn, Field, Badge, SlotGrid, Legend, STATUS_COLOR, C } from '../../ui';
import { toList, fmtTime, fmtDate, fmtDur, costFor, money, EARLY_MIN } from '../../utils';

export const personName = (users, uid) =>
  uid === 'walkin' ? 'Walk-in (no app)' : users?.[uid]?.name || (uid ? uid.slice(0, 6) : 'Unknown');
export const personVehicle = (users, uid) => (uid === 'walkin' ? '' : users?.[uid]?.vehicle || '');

export default function DashboardScreen() {
  const now = useNow(1000);
  const t = Math.floor(now / 1000);
  const slots = useValue('slots');
  const sb = useValue('slotBookings');
  const parked = useValue('parked');
  const users = useValue('users');
  const lot = useValue('lot');
  const bookings = useValue('bookings');
  const [rateInput, setRateInput] = useState('');
  const rate = lot?.ratePerHour ?? 0;

  const states = {};
  for (let n = 1; n <= 6; n++) {
    const bookedNow = Object.values(sb?.[n] || {}).some(
      (b) => t >= b.startSec - EARLY_MIN * 60 && t <= b.endSec
    );
    states[n] = slots?.[n]?.occupied ? 'occupied' : bookedNow ? 'booked' : 'free';
  }
  const freeCount = Object.values(states).filter((x) => x === 'free').length;

  const live = toList(parked).sort((a, b) => a.slot - b.slot);
  const upcoming = toList(bookings)
    .filter((b) => (b.status === 'confirmed' || b.status === 'arrived') && b.endSec > t)
    .sort((a, b) => a.startSec - b.startSec);

  const saveRate = async () => {
    const v = Number(rateInput);
    if (!v || v < 0) return Alert.alert('Invalid rate', 'Enter the hourly rate as a number.');
    try {
      await setRate(v);
      setRateInput('');
      Alert.alert('Saved', `New rate: ${money(v)} per hour. It applies to new parking sessions.`);
    } catch (e) {
      Alert.alert('Could not save', e.message);
    }
  };

  return (
    <Screen>
      <Text style={{ fontSize: 34, fontWeight: '800' }}>{freeCount} of 6 free</Text>
      <Muted style={{ marginBottom: 10 }}>{lot?.name || 'Your parking lot'} · {money(rate)} per hour</Muted>
      <SlotGrid states={states} />
      <Legend />

      <H>Parked now</H>
      {live.length === 0 && <Card><Muted>No cars parked.</Muted></Card>}
      {live.map((p) => {
        const elapsed = t - p.startSec;
        return (
          <Card key={p.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', fontSize: 16 }}>Slot {p.slot} · {personName(users, p.uid)}</Text>
              <Text style={{ fontWeight: '800' }}>{money(costFor(elapsed, rate))}</Text>
            </Row>
            <Muted>
              {personVehicle(users, p.uid) ? personVehicle(users, p.uid) + ' · ' : ''}In at {fmtTime(p.startSec)} · {fmtDur(elapsed)}
            </Muted>
          </Card>
        );
      })}

      <H>Upcoming bookings</H>
      {upcoming.length === 0 && <Card><Muted>No upcoming bookings.</Muted></Card>}
      {upcoming.map((b) => (
        <Card key={b.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800' }}>Slot {b.slot} · {personName(users, b.uid)}</Text>
            <Badge label={b.status} color={STATUS_COLOR[b.status]} />
          </Row>
          <Muted>{fmtDate(b.startSec)}, {fmtTime(b.startSec)} to {fmtTime(b.endSec)}</Muted>
        </Card>
      ))}

      <H>Hourly rate</H>
      <Card>
        <Muted style={{ marginBottom: 8 }}>Every started hour is charged. Current rate: {money(rate)} per hour.</Muted>
        <Field placeholder="New rate in ₹ per hour" keyboardType="numeric" value={rateInput} onChangeText={setRateInput} />
        <Btn title="Save rate" onPress={saveRate} style={{ backgroundColor: C.asphalt }} />
      </Card>
    </Screen>
  );
}
