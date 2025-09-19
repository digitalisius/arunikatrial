import { signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showPopup } from './ui.js';

const loginPage = document.getElementById('login-page');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const showRegisterBtn = document.getElementById('show-register-btn');
const showLoginBtn = document.getElementById('show-login-btn');
const authTitle = document.getElementById('auth-title');
const loginPrompt = document.getElementById('login-prompt');
const registerPrompt = document.getElementById('register-prompt');
const authButtons = document.querySelectorAll('.auth-btn');

let isNewLogin = false;

const setAuthButtonsLoading = (isLoading) => authButtons.forEach(btn => btn.disabled = isLoading);

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
    signInWithEmailAndPassword(auth, email, password).catch(handleAuthError).finally(() => setAuthButtonsLoading(false));
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
        }).catch(handleAuthError).finally(() => setAuthButtonsLoading(false));
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
    authError.textContent = message;
    authError.classList.remove('hidden');
};

const logOut = () => signOut(auth);

export const showLogoutConfirmation = () => {
    showPopup({
        title: 'Konfirmasi Keluar',
        message: 'Yakin ingin keluar, Bos?',
        icon: 'error',
        buttons: [{
            text: 'Batal',
            class: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
        }, {
            text: 'Ya, Keluar',
            class: 'bg-red-600 hover:bg-red-700 text-white',
            action: logOut
        }]
    });
};

const toggleAuthForms = (show) => {
    authError.classList.add('hidden');
    loginForm.classList.toggle('hidden', show === 'register');
    registerForm.classList.toggle('hidden', show !== 'register');
    authTitle.textContent = show === 'register' ? "Buat Akun Baru" : "Login ke Akun Anda";
    loginPrompt.classList.toggle('hidden', show === 'register');
    registerPrompt.classList.toggle('hidden', show !== 'register');
};

export function setupAuthListeners(onLogin, onLogout) {
    onAuthStateChanged(auth, user => {
        if (user) {
            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');
            const userName = user.displayName || user.email;
            document.getElementById('user-name').textContent = userName;
            if (userName) document.getElementById('user-initial').textContent = userName.charAt(0).toUpperCase();
            
            if (isNewLogin) {
                showPopup({ title: `Selamat Datang, ${userName}!`, message: 'Anda berhasil masuk.', icon: 'success', buttons: [{ text: 'Siap Bos' }] });
                isNewLogin = false;
            }
            onLogin(user);
        } else {
            loginPage.classList.remove('hidden');
            appContainer.classList.add('hidden');
            onLogout();
        }
    });

    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    showRegisterBtn.addEventListener('click', () => toggleAuthForms('register'));
    showLoginBtn.addEventListener('click', () => toggleAuthForms('login'));
}

