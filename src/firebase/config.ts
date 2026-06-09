import { getApp, getApps, initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyBJEN1ssn_xasBuiqE7nM2j4u53Hb-VWcc",
  authDomain: "yappa-50294.firebaseapp.com",
  databaseURL: "https://yappa-50294-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "yappa-50294",
  storageBucket: "yappa-50294.firebasestorage.app",
  messagingSenderId: "847891393940",
  appId: "1:847891393940:web:dd81cd1ddc223bbcf8f381",
};

export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const FIREBASE_CONFIGURED = true;
