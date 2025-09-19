// File ini berisi konfigurasi Firebase dan inisialisasi layanan utama.
// Memisahkannya membuat kode lebih rapi dan mudah dikelola.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Konfigurasi Firebase Anda
const firebaseConfig = {
    apiKey: "AIzaSyDriwT4n_ntiyhm14ZW6WXxAV-5f5wkcwQ",
    authDomain: "dompet-hanjaya.firebaseapp.com",
    projectId: "dompet-hanjaya",
    storageBucket: "dompet-hanjaya.firebasestorage.app",
    messagingSenderId: "875708784907",
    appId: "1:875708784907:web:9565bac8cb2783170b820e"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ekspor instance untuk digunakan di file lain
export { app, auth, db };
