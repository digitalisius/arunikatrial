import { initializeApp } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { handleLogin, handleRegister, showLogoutConfirmation, logOut } from './auth.js';
import { listenToTransactions, handleFormSubmit, handleDeleteTransaction, handleEditTransaction, generateXLSX, completeChallenge } from './api.js';
import { showPage, switchForm, setupModalListeners, resetInputForms, showPopup } from './ui.js';
import { renderDashboard, renderChart, renderLaporan, setupLaporanFilters, showTransactionDetails, showBalanceBreakdown } from './render.js';

// Global App Object
window.app = {
    // state
    transactions: [],
    chartState: { monthsToShow: 6, offset: 0 },
    reportCurrentPage: 1,
    reportItemsPerPage: 10,
    reportSortBy: 'createdAt', // 'createdAt' or 'tanggal'
    editingTransactionId: null,

    // methods from other modules
    showPage,
    switchForm,
    generateXLSX,
    showPopup,
    toggleAuthForms: (show) => {
        const authError = document.getElementById('auth-error');
        authError.classList.add('hidden');
        document.getElementById('login-form').classList.toggle('hidden', show === 'register');
        document.getElementById('register-form').classList.toggle('hidden', show !== 'register');
        document.getElementById('auth-title').textContent = show === 'register' ? "Buat Akun Baru" : "Login ke Akun Anda";
        document.getElementById('login-prompt').classList.toggle('hidden', show === 'register');
        document.getElementById('register-prompt').classList.toggle('hidden', show !== 'register');
    }
};

// --- LOGIKA LOGOUT OTOMATIS KARENA TIDAK AKTIF ---
let inactivityTimer;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    // Atur timer ke 1 jam (3600000 milidetik)
    inactivityTimer = setTimeout(() => {
        logOut(); // Panggil fungsi logout
        showPopup({
            title: 'Sesi Berakhir',
            message: 'Anda telah keluar secara otomatis karena tidak aktif selama 1 jam.',
            icon: 'error',
            buttons: [{ text: 'OK' }]
        });
    }, 3600000); 
}

function setupActivityListeners() {
    // Reset timer jika ada event berikut
    window.addEventListener('mousemove', resetInactivityTimer, true);
    window.addEventListener('mousedown', resetInactivityTimer, true);
    window.addEventListener('keypress', resetInactivityTimer, true);
    window.addEventListener('touchmove', resetInactivityTimer, true);
    window.addEventListener('scroll', resetInactivityTimer, true);
}

function clearActivityListeners() {
    // Hapus listener saat pengguna logout
    window.removeEventListener('mousemove', resetInactivityTimer, true);
    window.removeEventListener('mousedown', resetInactivityTimer, true);
    window.removeEventListener('keypress', resetInactivityTimer, true);
    window.removeEventListener('touchmove', resetInactivityTimer, true);
    window.removeEventListener('scroll', resetInactivityTimer, true);
    clearTimeout(inactivityTimer);
}
// --- AKHIR DARI LOGIKA LOGOUT OTOMATIS ---


document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    feather.replace();

    const auth = getAuth();
    let isNewLogin = false;

    onAuthStateChanged(auth, user => {
        const loginPage = document.getElementById('login-page');
        const appContainer = document.getElementById('app-container');

        if (user) {
            window.currentUser = user;
            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');
            
            const userName = user.displayName || user.email;
            document.getElementById('user-name').textContent = userName;
            if (userName) document.getElementById('user-initial').textContent = userName.charAt(0).toUpperCase();
            
            if (isNewLogin) {
                window.app.showPopup({ title: `Selamat Datang, ${userName}!`, message: 'Anda berhasil masuk.', icon: 'success', buttons: [{ text: 'Siap Bos' }] });
                isNewLogin = false;
            }
            
            listenToTransactions();
            initializeUI();
            
            // Mulai lacak aktivitas saat pengguna login
            setupActivityListeners();
            resetInactivityTimer();
        } else {
            window.currentUser = null;
            loginPage.classList.remove('hidden');
            appContainer.classList.add('hidden');
            if (window.unsubscribeFromFirestore) {
                window.unsubscribeFromFirestore();
            }
            // Hentikan pelacakan aktivitas saat pengguna logout
            clearActivityListeners();
        }
    });

    // Event Listeners for auth
    document.getElementById('login-form').addEventListener('submit', (e) => {
        isNewLogin = true;
        handleLogin(e);
    });
    document.getElementById('register-form').addEventListener('submit', (e) => {
        isNewLogin = true;
        handleRegister(e);
    });
    document.getElementById('show-register-btn').addEventListener('click', () => window.app.toggleAuthForms('register'));
    document.getElementById('show-login-btn').addEventListener('click', () => window.app.toggleAuthForms('login'));
    document.getElementById('logout-btn').addEventListener('click', showLogoutConfirmation);
    document.getElementById('logout-btn-mobile').addEventListener('click', showLogoutConfirmation);
    
    // Form submission
    document.getElementById('form-pemasukan').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-pengeluaran').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-transfer').addEventListener('submit', handleFormSubmit);

    // Other listeners
    document.getElementById('laporan-tabel').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const row = e.target.closest('tr[data-transaction-id]');

        if (editBtn) {
            e.stopPropagation();
            handleEditTransaction(editBtn.dataset.id);
        } else if (deleteBtn) {
            e.stopPropagation();
            handleDeleteTransaction(deleteBtn.dataset.id);
        } else if (row) {
            showTransactionDetails(row.dataset.transactionId);
        }
    });

    ['pemasukan-foto', 'pengeluaran-foto'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
            const preview = document.getElementById(id.replace('foto', 'preview'));
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => { preview.src = ev.target.result; preview.classList.remove('hidden'); }
                reader.readAsDataURL(e.target.files[0]);
            } else {
                preview.classList.add('hidden');
            }
        });
    });

    document.getElementById('saldo-card').addEventListener('click', showBalanceBreakdown);
    
    document.getElementById('sort-by-created-at-btn').addEventListener('click', () => {
        window.app.reportSortBy = 'createdAt';
        document.getElementById('report-sort-modal').classList.add('hidden');
        renderLaporan();
    });
    document.getElementById('sort-by-tanggal-btn').addEventListener('click', () => {
        window.app.reportSortBy = 'tanggal';
        document.getElementById('report-sort-modal').classList.add('hidden');
        renderLaporan();
    });
    
    document.getElementById('challenge-complete-btn').addEventListener('click', completeChallenge);

    document.getElementById('chart-prev-btn').addEventListener('click', () => { window.app.chartState.offset++; renderChart(); });
    document.getElementById('chart-next-btn').addEventListener('click', () => { window.app.chartState.offset = Math.max(0, window.app.chartState.offset - 1); renderChart(); });

    document.getElementById('recent-transactions-list').addEventListener('click', (e) => {
        const item = e.target.closest('[data-transaction-id]');
        if (item) showTransactionDetails(item.dataset.transactionId);
    });

    setupModalListeners();
});

const initializeUI = () => {
    feather.replace();
    showPage('beranda');
    switchForm('pemasukan');
    resetInputForms();
    setupLaporanFilters();
};

