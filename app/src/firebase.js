import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase console > Project settings > Your apps > Web app
const firebaseConfig = {
  apiKey: 'AIzaSyA6YxOAQhcRiaR1Vdb63UXHQW1CzPy6DKA',
  authDomain: 'smart-parking-8290e.firebaseapp.com',
  databaseURL: 'https://smart-parking-8290e-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'smart-parking-8290e',
  appId: '1:214777266210:web:382387b74f598ebbf48a7b',
};

const app = initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch (e) {
  auth = getAuth(app); // fast refresh re-runs this file
}

export { auth };
export const db = getDatabase(app);
