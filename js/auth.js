// File ini khusus menangani semua logika yang berhubungan dengan autentikasi:
// login, registrasi, logout, dan memantau status login pengguna.

import { 
    signOut, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, updateProfile 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showPopup } from './ui.js';

let isNewLogin = false;

const setAuthButtonsLoading = (isLoading) => {
    document.querySelectorAll('.auth-btn').forEach(btn => btn.disabled = isLoading);
};

const handleLogin = async (e) => {
    e.preventDefault();
    setAuthButtonsLoading(true);
    isNewLogin = true;
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    let email = identifier;

    if (identifier && !identifier.includes('@')) {
        try {
            const usernameDoc = await getDoc(doc(db, "usernames", identifier.toLowerCase()));
            if (usernameDoc.exists()) {
                email = usernameDoc.data().email;
            } else {
                handleAuthError({ code: 'auth/user-not-found' });
                setAuthButtonsLoading(false);
                return;
            }
        } catch (error) {
            console.error("Error fetching username:", error);
            handleAuthError({});
            setAuthButtonsLoading(false);
            return;
        }
    }
    signInWithEmailAndPassword(auth, email, password)
        .catch(handleAuthError)
        .finally(() => setAuthButtonsLoading(false));
};

const handleRegister = async (e) => {
    e.preventDefault();
    setAuthButtonsLoading(true);
    isNewLogin = true;
    const username = document.getElementById('register-username').value.trim().toLowerCase();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!/^[a-zA-Z0-9_]{3,15}$/.test(username)) {
        handleAuthError({ code: 'auth/invalid-username' });
        setAuthButtonsLoading(false);
        return;
    }
    const usernameDoc = await getDoc(doc(db, "usernames", username));
    if (usernameDoc.exists()) {
        handleAuthError({ code: 'auth/username-already-in-use' });
        setAuthButtonsLoading(false);
        return;
    }

    createUserWithEmailAndPassword(auth, email, password)
        .then(async (userCredential) => {
            await updateProfile(userCredential.user, { displayName: username });
            await setDoc(doc(db, "usernames", username), { uid: userCredential.user.uid, email: email });
        })
        .catch(handleAuthError)
        .finally(() => setAuthButtonsLoading(false));
};

const handleAuthError = (error) => {
    isNewLogin = false;
    let message = "Terjadi kesalahan. Silakan coba lagi.";
    switch (error.code) {
        case 'auth/user-not-found': message = "Username atau email tidak terdaftar."; break;
        case 'auth/wrong-password': message = "Password salah."; break;
        case 'auth/email-already-in-use': message = "Email ini sudah terdaftar."; break;
        case 'auth/username-already-in-use': message = "Username ini sudah digunakan."; break;
        case 'auth/invalid-username': message = "Format username tidak valid. Gunakan 3-15 karakter (huruf, angka, atau _)."; break;
        case 'auth/weak-password': message = "Password terlalu lemah (minimal 6 karakter)."; break;
        case 'auth/invalid-email': message = "Format email tidak valid."; break;
    }
    const authError = document.getElementById('auth-error');
    authError.textContent = message;
    authError.classList.remove('hidden');
};

export const logOut = () => {
    showPopup({
        title: 'Konfirmasi Keluar',
        message: 'Yakin ingin keluar, Bos?',
        icon: 'error',
        buttons: [
            { text: 'Batal', class: 'bg-gray-200 hover:bg-gray-300 text-gray-800' },
            { text: 'Ya, Keluar', class: 'bg-red-600 hover:bg-red-700 text-white', action: () => signOut(auth) }
        ]
    });
};

/**
 * Fungsi untuk logout otomatis karena tidak ada aktivitas.
 */
export const inactivityLogout = () => {
  // Mencegah popup ganda jika sudah ada yang terbuka
  if (!document.getElementById('popup-modal').classList.contains('hidden')) {
    return;
  }
  showPopup({
      title: 'Sesi Anda Telah Berakhir',
      message: 'Untuk keamanan, Anda telah dikeluarkan secara otomatis karena tidak ada aktivitas.',
      icon: 'error',
      buttons: [
          { 
              text: 'Login Kembali', 
              action: () => signOut(auth) 
          }
      ]
  });
};

const toggleAuthForms = (show) => {
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('login-form').classList.toggle('hidden', show === 'register');
    document.getElementById('register-form').classList.toggle('hidden', show !== 'register');
    document.getElementById('auth-title').textContent = show === 'register' ? "Buat Akun Baru" : "Login ke Akun Anda";
    document.getElementById('login-prompt').classList.toggle('hidden', show === 'register');
    document.getElementById('register-prompt').classList.toggle('hidden', show !== 'register');
};

export const initAuth = (onLoginCallback, onLogoutCallback) => {
    onAuthStateChanged(auth, user => {
        if (user) {
            onLoginCallback(user);
            if (isNewLogin) {
                showPopup({ title: `Selamat Datang, ${user.displayName || user.email}!`, message: 'Anda berhasil masuk.', icon: 'success', buttons: [{ text: 'Siap Bos' }] });
                isNewLogin = false;
            }
        } else {
            onLogoutCallback();
        }
    });

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('show-register-btn').addEventListener('click', () => toggleAuthForms('register'));
    document.getElementById('show-login-btn').addEventListener('click', () => toggleAuthForms('login'));
};
