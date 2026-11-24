// Keep GRACE_MIN / EARLY_MIN identical to GRACE_SEC / EARLY_SEC in the firmware.
export const GRACE_MIN = 15 * 60; // booking is released if driver hasn't arrived this long after start
export const EARLY_MIN = 10 * 60; // driver may check in at the gate this long before start
export const SLOT_LAYOUT = [[3, 2, 1], [4, 5, 6]]; // same order as the LCD grid
export const ROW_LABELS = ['L1', 'L2'];

export const nowSec = () => Math.floor(Date.now() / 1000);

// Firebase returns null holes for numeric keys, so drop falsy values.
export const toList = (obj) =>
  Object.entries(obj || {})
    .filter(([, v]) => v)
    .map(([id, v]) => ({ id, ...v }));

const p2 = (n) => String(n).padStart(2, '0');
export const fmtTime = (s) => {
  if (!s) return '--:--';
  const d = new Date(s * 1000);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const fmtDate = (s) =>
  new Date(s * 1000).toLocaleDateString([], { day: 'numeric', month: 'short' });
export const fmtDur = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  return `${p2(Math.floor(sec / 3600))}:${p2(Math.floor((sec % 3600) / 60))}:${p2(sec % 60)}`;
};

// Per-hour pricing: every started hour is charged, minimum one hour.
export const billableHours = (sec) => Math.max(1, Math.ceil(sec / 3600));
export const costFor = (sec, rate) => billableHours(sec) * (rate || 0);
export const money = (n) => `₹${n}`;

export const overlaps = (a, b) => a.startSec < b.endSec && a.endSec > b.startSec;

export const bookingLabel = (b, t) =>
  b.status === 'confirmed' && t > b.startSec + GRACE_MIN * 60 ? 'expired' : b.status;
