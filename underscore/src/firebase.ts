import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Replace with your Firebase config or load from env
const firebaseConfig = {
    apiKey: "AIzaSyDx8Kz5Helmn_Vv2cKIGJyikHDoZf-mFg8",
    authDomain: "underscore-27026.firebaseapp.com",
    projectId: "underscore-27026",
    storageBucket: "underscore-27026.firebasestorage.app",
    messagingSenderId: "1094795206623",
    appId: "1:1094795206623:web:c4c2c0478e5be7b8d02e6a",
    measurementId: "G-YWKEM15W5Y"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);


