import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, onValue, set } from 'firebase/database';
import { auth, db } from './firebase';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) { setProfile(null); setLoading(false); }
      }),
    []
  );

  useEffect(() => {
    if (!user) return undefined;
    return onValue(ref(db, `users/${user.uid}`), (snap) => {
      setProfile(snap.val());
      setLoading(false);
    });
  }, [user]);

  const signIn = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);

  // Sign-up always creates a driver. Admin accounts are created by the parking owner in the Firebase console.
  const signUp = async ({ name, vehicle, email, password }) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await set(ref(db, `users/${cred.user.uid}`), {
      name: name.trim(), vehicle: vehicle.trim().toUpperCase(), email: email.trim(), role: 'driver',
    });
  };

  const logout = () => signOut(auth);

  return (
    <Ctx.Provider value={{ user, profile, loading, isAdmin: profile?.role === 'admin', signIn, signUp, logout }}>
      {children}
    </Ctx.Provider>
  );
}
