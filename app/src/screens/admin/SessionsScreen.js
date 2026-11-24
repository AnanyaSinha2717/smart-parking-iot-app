import React from 'react';
import { Text } from 'react-native';
import { useValue, useRecent } from '../../hooks';
import { Screen, Card, H, Muted, Row } from '../../ui';
import { toList, fmtTime, fmtDate, fmtDur, money } from '../../utils';
import { personName, personVehicle } from './DashboardScreen';

export default function SessionsScreen() {
  const raw = useRecent('sessions', 'endSec', 200);
  const users = useValue('users');
  const list = toList(raw).sort((a, b) => b.endSec - a.endSec);

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const sod = Math.floor(startOfToday.getTime() / 1000);
  const today = list.filter((s) => s.endSec >= sod);
  const sum = (arr) => arr.reduce((a, s) => a + (s.amount || 0), 0);

  return (
    <Screen>
      <Row style={{ marginBottom: 12 }}>
        <Card style={{ flex: 1, marginRight: 8, marginBottom: 0 }}>
          <Muted>Earned today</Muted>
          <Text style={{ fontSize: 26, fontWeight: '800' }}>{money(sum(today))}</Text>
          <Muted>{today.length} sessions</Muted>
        </Card>
        <Card style={{ flex: 1, marginBottom: 0 }}>
          <Muted>Last {list.length} sessions</Muted>
          <Text style={{ fontSize: 26, fontWeight: '800' }}>{money(sum(list))}</Text>
        </Card>
      </Row>

      <H>Every driver's parking time</H>
      {list.length === 0 && <Card><Muted>Completed sessions appear here once a car leaves its slot.</Muted></Card>}
      {list.map((s) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800' }}>{personName(users, s.uid)}</Text>
            <Text style={{ fontWeight: '800' }}>{money(s.amount)}</Text>
          </Row>
          <Muted>
            {personVehicle(users, s.uid) ? personVehicle(users, s.uid) + ' · ' : ''}Slot {s.slot} · {fmtDate(s.endSec)}
          </Muted>
          <Muted>
            {fmtTime(s.startSec)} to {fmtTime(s.endSec)} · {fmtDur(s.durationSec)} · {money(s.rate)} per hour
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}
