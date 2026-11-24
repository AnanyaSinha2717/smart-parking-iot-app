import { ref, set, update, remove, push, runTransaction } from 'firebase/database';
import { db } from './firebase';
import { nowSec, overlaps, EARLY_MIN, GRACE_MIN } from './utils';

// Books a slot. The overlap check runs inside a transaction so two drivers can't take the same window.
export async function bookSlot({ uid, slot, startSec, endSec, rate }) {
  const id = push(ref(db, 'bookings')).key;
  const result = await runTransaction(ref(db, `slotBookings/${slot}`), (cur) => {
    const obj = cur || {};
    const win = { startSec, endSec };
    if (Object.values(obj).some((b) => overlaps(b, win))) return; // abort
    obj[id] = win;
    return obj;
  });
  if (!result.committed) {
    throw new Error('Someone just booked this slot for that time. Pick another slot.');
  }
  try {
    await set(ref(db, `bookings/${id}`), {
      uid, slot, startSec, endSec, rate, status: 'confirmed', createdSec: nowSec(),
    });
  } catch (e) {
    await remove(ref(db, `slotBookings/${slot}/${id}`));
    throw e;
  }
  return id;
}

const closeBooking = (b, status) =>
  update(ref(db), {
    [`bookings/${b.id}/status`]: status,
    [`slotBookings/${b.slot}/${b.id}`]: null,
  });

export const cancelBooking = (b) => closeBooking(b, 'cancelled');
export const expireBooking = (b) => closeBooking(b, 'expired');

// Tells the gate "this driver is here". The ESP32 reads gate/arrival when its IR sensor sees a car.
export async function arriveAtGate(b, uid) {
  const t = nowSec();
  if (t < b.startSec - EARLY_MIN * 60) throw new Error(`Gate check-in opens ${EARLY_MIN} minutes before your start time.`);
  if (t > b.endSec) throw new Error('This booking has ended.');
  if (b.status === 'confirmed' && t > b.startSec + GRACE_MIN * 60) throw new Error('The grace period is over, so this booking was released.');
  await update(ref(db), {
    [`bookings/${b.id}/status`]: 'arrived',
    'gate/arrival': { bookingId: b.id, slot: b.slot, uid, ts: t },
  });
}

export const setRate = (rate) => set(ref(db, 'lot/ratePerHour'), Number(rate));
