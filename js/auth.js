import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

export function initializeAuthListener(onUserLoggedIn, onUserLoggedOut) {
    onAuthStateChanged(auth, user => {
        if (user) {
            onUserLoggedIn(user);
        } else {
            onUserLoggedOut();
        }
    });
}

export async function loginUser(identifier, password) {
    let email = identifier;
    if (identifier && !identifier.includes('@')) {
        const usernameDoc = await getDoc(doc(db, "usernames", identifier.toLowerCase()));
        if (usernameDoc.exists()) {
            email = usernameDoc.data().email;
        } else {
            throw new Error("auth/user-not-found");
        }
    }
    return signInWithEmailAndPassword(auth, email, password);
}

export async function registerUser(username, email, password) {
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(username)) {
        throw new Error("auth/invalid-username");
    }
    const usernameDoc = await getDoc(doc(db, "usernames", username.toLowerCase()));
    if (usernameDoc.exists()) {
        throw new Error("auth/username-already-in-use");
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: username });
    await setDoc(doc(db, "usernames", username.toLowerCase()), { 
        uid: userCredential.user.uid, 
        email: email 
    });
    return userCredential;
}

export function logoutUser() {
    return signOut(auth);
}

export function getAuthErrorMessage(code) {
    if (code.includes('auth/user-not-found')) return "Username atau email tidak terdaftar.";
    if (code.includes('auth/wrong-password')) return "Password salah.";
    if (code.includes('auth/email-already-in-use')) return "Email ini sudah terdaftar.";
    if (code.includes('auth/username-already-in-use')) return "Username ini sudah digunakan.";
    if (code.includes('auth/invalid-username')) return "Format username tidak valid (3-15 karakter, huruf, angka, _).";
    if (code.includes('auth/weak-password')) return "Password terlalu lemah (minimal 6 karakter).";
    if (code.includes('auth/invalid-email')) return "Format email tidak valid.";
    return "Terjadi kesalahan. Silakan coba lagi.";
}

