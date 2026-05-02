import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB2WrnkhwrysAi5qlWLFl1l9EnkVDNzdlM",
  authDomain: "snap-duel-5252.firebaseapp.com",
  projectId: "snap-duel-5252",
  storageBucket: "snap-duel-5252.firebasestorage.app",
  messagingSenderId: "779186063602",
  appId: "1:779186063602:web:adbbf5b6723e3a0e9f686b",
  measurementId: "G-MG7ZEQKMNL",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
