import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- KONFIGURASI ---
const firebaseConfig = {
    apiKey: "AIzaSyDriwT4n_ntiyhm14ZW6WXxAV-5f5wkcwQ",
    authDomain: "dompet-hanjaya.firebaseapp.com",
    projectId: "dompet-hanjaya",
    storageBucket: "dompet-hanjaya.firebasestorage.app",
    messagingSenderId: "875708784907",
    appId: "1:875708784907:web:9565bac8cb2783170b820e"
};

export const CLOUDINARY_CLOUD_NAME = 'dtvmbvwtx';
export const CLOUDINARY_UPLOAD_PRESET = 'dompet';

// --- INISIALISASI ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

