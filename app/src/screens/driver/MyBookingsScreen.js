import React, { useState } from 'react';
import { Text, Alert } from 'react-native';
import { useAuth } from '../../AuthContext';
import { useValue, useByUid, useNow } from '../../hooks';
import { cancelBooking, arriveAtGate } from '../../api';
import { Screen, Card, H, Muted, Row, Btn, Badge, STATUS_COLOR, C } from '../../ui';
import {
  toList, fmtTime, fmtDate, fmtDur, costFor, money, bookingLabel, EARLY_MIN, GRACE_MIN,
} from '../../utils';

export default function MyBookingsScreen() {
  const { user } = useAuth();
  const now = useNow(1000);
  const t = Math.floor(now / 1000);
  const lot = useValue('lot');
  const rate = lot?.ratePerHour ?? 0;
  const bookings = useByUid('bookings', user.uid);
  const parked = useByUid('parked', user.uid);
  const sessions = useByUid('sessions', user.uid);
  const [busyId, setBusyId] = useState(null);

  const live = toList(parked);
  const upcoming = toList(bookings)
    .filter((b) => (b.status === 'confirmed' || b.status === 'arrived') && b.endSec > t)
    .filter((b) => bookingLabel(b, t) !== 'expired')
    .sort((a, b) => a.startSec - b.startSec);
  const history = toList(sessions).sort((a, b) => b.endSec - a.endSec);

  const run = async (b, fn, okMsg) => {
    setBusyId(b.id);
    try {
      await fn();
      if (okMsg) Alert.alert('Done', okMsg);
    } catch (e) {
      Alert.alert('Could not do that', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = (b) =>
    Alert.alert('Cancel booking?', `Slot ${b.slot}, ${fmtTime(b.startSec)} to ${fmtTime(b.endSec)}. You won't be charged.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => run(b, () => cancelBooking(b)) },
    ]);

  return (
    <Screen>
      {live.map((p) => {
        const elapsed = t - p.startSec;
        return (
          <Card key={p.id} style={{ borderColor: C.free, borderWidth: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H>Parked in slot {p.slot}</H>
              <Badge label="parked" color={C.free} />
            </Row>
            <Text style={{ fontSize: 34, fontWeight: '800' }}>{fmtDur(elapsed)}</Text>
            <Muted>Since {fmtTime(p.startSec)} · {money(costFor(elapsed, rate))} so far at {money(rate)} per hour</Muted>
          </Card>
        );
      })}

      <H>Your bookings</H>
      {upcoming.length === 0 && (
        <Card><Muted>No active bookings. Go to "Book a slot" to reserve one.</Muted></Card>
      )}
      {upcoming.map((b) => {
        const canCheckIn = t >= b.startSec - EARLY_MIN * 60 && (b.status === 'arrived' || t <= b.startSec + GRACE_MIN * 60);
        return (
          <Card key={b.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>Slot {b.slot}</Text>
              <Badge label={b.status} color={STATUS_COLOR[b.status]} />
            </Row>
            <Muted style={{ marginTop: 4 }}>
              {fmtDate(b.startSec)}, {fmtTime(b.startSec)} to {fmtTime(b.endSec)} · {money(b.rate)} per hour
            </Muted>
            <Row style={{ marginTop: 12 }}>
              <Btn
                title={b.status === 'arrived' ? 'Gate notified, tap to resend' : "I'm at the gate"}
                disabled={!canCheckIn}
                busy={busyId === b.id}
                style={{ flex: 1, marginRight: 8 }}
                onPress={() =>
                  run(b, () => arriveAtGate(b, user.uid), 'The gate knows you are here. Drive in and follow the blinking LED to your slot.')
                }
              />
              <Btn kind="ghost" title="Cancel" onPress={() => confirmCancel(b)} />
            </Row>
            {!canCheckIn && <Muted style={{ marginTop: 8 }}>Gate check-in opens at {fmtTime(b.startSec - EARLY_MIN * 60)}.</Muted>}
          </Card>
        );
      })}

      <H>Parking history</H>
      {history.length === 0 && <Card><Muted>Your completed parking sessions will show up here.</Muted></Card>}
      {history.map((h) => (
        <Card key={h.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800' }}>Slot {h.slot} · {fmtDate(h.endSec)}</Text>
            <Text style={{ fontWeight: '800' }}>{money(h.amount)}</Text>
          </Row>
          <Muted>
            {fmtTime(h.startSec)} to {fmtTime(h.endSec)} · {fmtDur(h.durationSec)} · {money(h.rate)} per hour
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}
