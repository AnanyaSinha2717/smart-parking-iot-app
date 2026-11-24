import React, { useState } from 'react';
import { Text, Alert } from 'react-native';
import { useAuth } from '../../AuthContext';
import { useValue, useByUid, useNow } from '../../hooks';
import { bookSlot } from '../../api';
import { Screen, Card, H, Muted, Chip, SlotGrid, Legend, Row } from '../../ui';
import { toList, overlaps, nowSec, fmtTime, money } from '../../utils';

const START_OPTS = [
  { l: 'Now', m: 0 }, { l: 'In 30 min', m: 30 }, { l: 'In 1 h', m: 60 },
  { l: 'In 2 h', m: 120 }, { l: 'In 4 h', m: 240 }, { l: 'In 8 h', m: 480 },
];
const DUR_OPTS = [1, 2, 3, 4, 6, 8];

export default function SlotsScreen() {
  const { user } = useAuth();
  const now = useNow(10000);
  const slots = useValue('slots');
  const sb = useValue('slotBookings');
  const lot = useValue('lot');
  const mine = useByUid('bookings', user.uid);
  const [startM, setStartM] = useState(0);
  const [durH, setDurH] = useState(1);

  const rate = lot?.ratePerHour ?? 0;
  const startSec = Math.floor(now / 1000) + startM * 60;
  const endSec = startSec + durH * 3600;
  const myIds = new Set(
    toList(mine).filter((b) => b.status === 'confirmed' || b.status === 'arrived').map((b) => b.id)
  );

  // Status of each bay for the window the driver picked.
  const states = {};
  for (let n = 1; n <= 6; n++) {
    const clashes = Object.entries(sb?.[n] || {}).filter(([, b]) => overlaps(b, { startSec, endSec }));
    if (clashes.length) states[n] = clashes.some(([id]) => myIds.has(id)) ? 'mine' : 'booked';
    else if (startM === 0 && slots?.[n]?.occupied) states[n] = 'occupied';
    else states[n] = 'free';
  }

  const onSlot = (slot, st) => {
    if (st === 'mine') return Alert.alert('Already yours', 'You have a booking for this slot in that time window.');
    if (st !== 'free') return Alert.alert('Not available', st === 'booked' ? 'This slot is booked for that time. Try another slot or time.' : 'A car is parked here right now.');
    const s = nowSec() + startM * 60;
    const e = s + durH * 3600;
    Alert.alert(
      `Book slot ${slot}?`,
      `${fmtTime(s)} to ${fmtTime(e)} (${durH} h)\n${money(rate)} per hour, about ${money(rate * durH)}\n\nCheck in at the gate within 15 min of your start time or the booking is released.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book',
          onPress: async () => {
            try {
              await bookSlot({ uid: user.uid, slot, startSec: s, endSec: e, rate });
              Alert.alert('Booked', `Slot ${slot} is yours. Open "My parking" when you reach the gate.`);
            } catch (err) {
              Alert.alert('Could not book', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <Card>
        <H>When do you arrive?</H>
        <Row style={{ flexWrap: 'wrap' }}>
          {START_OPTS.map((o) => <Chip key={o.m} label={o.l} active={startM === o.m} onPress={() => setStartM(o.m)} />)}
        </Row>
        <H>How long will you stay?</H>
        <Row style={{ flexWrap: 'wrap' }}>
          {DUR_OPTS.map((h) => <Chip key={h} label={`${h} h`} active={durH === h} onPress={() => setDurH(h)} />)}
        </Row>
        <Muted>
          {fmtTime(startSec)} to {fmtTime(endSec)} · {money(rate)} per hour · about {money(rate * durH)}
        </Muted>
      </Card>

      <Text style={{ fontWeight: '800', fontSize: 17, marginBottom: 8 }}>{lot?.name || 'Parking lot'}</Text>
      <SlotGrid states={states} onPress={onSlot} />
      <Legend items={['free', 'booked', 'occupied', 'mine']} />
      <Muted style={{ textAlign: 'center', marginTop: 10 }}>Tap a green slot to book it.</Muted>
    </Screen>
  );
}
