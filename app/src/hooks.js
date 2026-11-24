import { useEffect, useState } from 'react';
import { ref, onValue, query, orderByChild, equalTo, limitToLast } from 'firebase/database';
import { db } from './firebase';

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function useListener(build, key) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const q = build();
    if (!q) return undefined;
    return onValue(
      q,
      (snap) => setValue(snap.val()),
      (err) => console.warn('DB read failed:', key, err.message)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

export const useValue = (path) => useListener(() => (path ? ref(db, path) : null), path);

// Rows whose `uid` equals the given uid (the DB rules only allow this form of query for drivers)
export const useByUid = (path, uid) =>
  useListener(() => (uid ? query(ref(db, path), orderByChild('uid'), equalTo(uid)) : null), path + uid);

export const useRecent = (path, child, n) =>
  useListener(() => query(ref(db, path), orderByChild(child), limitToLast(n)), path + child + n);
