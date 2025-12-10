import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBf-dvyFjMttuLD43V4MBBRbuvfbwBRKsI",
  authDomain: "wines-sheet.firebaseapp.com",
  projectId: "wines-sheet",
  storageBucket: "wines-sheet.firebasestorage.app",
  messagingSenderId: "313820033015",
  appId: "1:313820033015:web:75cc4ccf84217324bf08f2"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
