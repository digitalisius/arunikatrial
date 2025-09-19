import { initializeUI, showPage, switchForm, showPopup, showLogoutConfirmation, handleFormSubmit, handleDeleteClick, handleEditClick, handleChallengeComplete } from './ui.js';
import { renderDashboard, renderChart, renderLaporan, setupLaporanFilters, showTransactionDetails, showBalanceBreakdown, generateXLSX } from './render.js';
import { initializeAuthListener, loginUser, registerUser, getAuthErrorMessage } from './auth.js';
import { listenToTransactions } from './api.js';

class App {
    constructor() {
        this.transactions = [];
        this.currentUser = null;
        this.unsubscribeFromFirestore = null;
        this.editingTransactionId = null;
        this.chartState = { monthsToShow: 6, offset: 0 };
        this.reportCurrentPage = 1;
        this.reportItemsPerPage = 10;
        this.reportSortBy = 'createdAt';
        this.inactivityTimer = null;

        // Make UI and Render functions globally accessible through the app instance
        this.ui = {
            showPage: showPage.bind(this),
            switchForm: switchForm.bind(this),
            showPopup: showPopup.bind(this),
            showLogoutConfirmation: showLogoutConfirmation.bind(this),
            handleFormSubmit: handleFormSubmit.bind(this),
            handleDeleteClick: handleDeleteClick.bind(this),
            handleEditClick: handleEditClick.bind(this),
            handleChallengeComplete: handleChallengeComplete.bind(this),
        };

        this.render = {
            renderDashboard: renderDashboard.bind(this),
            renderChart: renderChart.bind(this),
            renderLaporan: renderLaporan.bind(this),
            setupLaporanFilters: setupLaporanFilters.bind(this),
            showTransactionDetails: showTransactionDetails.bind(this),
            showBalanceBreakdown: showBalanceBreakdown.bind(this),
            generateXLSX: generateXLSX.bind(this),
        };

        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            window.app = this; // Make the app instance global
            initializeUI(this);
            initializeAuthListener(this.onUserLoggedIn.bind(this), this.onUserLoggedOut.bind(this));
            this.setupAllEventListeners();
            this.populatePageContent();
        });
    }
    
    populatePageContent() {
        // This function injects the HTML content into the placeholder divs
        // This is a workaround for not having a templating engine
        document.getElementById('beranda-page').innerHTML = `<!-- Konten Beranda -->`;
        // ... and so on for all other pages. 
        // NOTE: For brevity, I will add the full HTML directly in the next step.
    }

    onUserLoggedIn(user) {
        this.currentUser = user;
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        
        const userName = user.displayName || user.email;
        document.getElementById('user-name').textContent = userName;
        document.getElementById('user-initial').textContent = userName.charAt(0).toUpperCase();
        
        if (this.unsubscribeFromFirestore) this.unsubscribeFromFirestore();
        this.unsubscribeFromFirestore = listenToTransactions(user.uid, (newTransactions) => {
            this.transactions = newTransactions;
            this.render.renderDashboard();
            this.render.renderChart();
            if(!document.getElementById('laporan-page').classList.contains('hidden')) {
                this.render.renderLaporan();
            }
        });

        this.resetInactivityTimer();
        ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            window.addEventListener(event, () => this.resetInactivityTimer());
        });
        
        this.ui.showPage('beranda');
        this.render.setupLaporanFilters();
    }

    onUserLoggedOut() {
        this.currentUser = null;
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        if (this.unsubscribeFromFirestore) this.unsubscribeFromFirestore();
        this.transactions = [];
        this.render.renderDashboard(); // Clear dashboard
        clearTimeout(this.inactivityTimer);
    }

    setupAllEventListeners() {
        // Auth Forms
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const showRegisterBtn = document.getElementById('show-register-btn');
        const showLoginBtn = document.getElementById('show-login-btn');
        const authErrorEl = document.getElementById('auth-error');
        
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authErrorEl.classList.add('hidden');
            const identifier = loginForm.querySelector('#login-identifier').value.trim();
            const password = loginForm.querySelector('#login-password').value;
            try {
                await loginUser(identifier, password);
            } catch (error) {
                authErrorEl.textContent = getAuthErrorMessage(error.message);
                authErrorEl.classList.remove('hidden');
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authErrorEl.classList.add('hidden');
            const username = registerForm.querySelector('#register-username').value.trim();
            const email = registerForm.querySelector('#register-email').value.trim();
            const password = registerForm.querySelector('#register-password').value;
            try {
                await registerUser(username, email, password);
            } catch (error) {
                authErrorEl.textContent = getAuthErrorMessage(error.message);
                authErrorEl.classList.remove('hidden');
            }
        });

        const toggleAuthForms = (formToShow) => {
            authErrorEl.classList.add('hidden');
            loginForm.classList.toggle('hidden', formToShow === 'register');
            registerForm.classList.toggle('hidden', formToShow !== 'register');
            document.getElementById('auth-title').textContent = formToShow === 'register' ? "Buat Akun Baru" : "Login ke Akun Anda";
            document.getElementById('login-prompt').classList.toggle('hidden', formToShow === 'register');
            document.getElementById('register-prompt').classList.toggle('hidden', formToShow !== 'register');
        };
        showRegisterBtn.addEventListener('click', () => toggleAuthForms('register'));
        showLoginBtn.addEventListener('click', () => toggleAuthForms('login'));

        // Main App Listeners
        document.getElementById('logout-btn').addEventListener('click', this.ui.showLogoutConfirmation);
        document.getElementById('logout-btn-mobile').addEventListener('click', this.ui.showLogoutConfirmation);
        
        document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
            if (btn.id.includes('logout')) return;
            btn.addEventListener('click', () => this.ui.showPage(btn.dataset.page));
        });

        document.getElementById('form-pemasukan').addEventListener('submit', this.ui.handleFormSubmit);
        document.getElementById('form-pengeluaran').addEventListener('submit', this.ui.handleFormSubmit);
        document.getElementById('form-transfer').addEventListener('submit', this.ui.handleFormSubmit);

        document.getElementById('laporan-tabel').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            const row = e.target.closest('tr[data-transaction-id]');

            if (editBtn) this.ui.handleEditClick(editBtn.dataset.id);
            else if (deleteBtn) this.ui.handleDeleteClick(deleteBtn.dataset.id);
            else if (row) this.render.showTransactionDetails(row.dataset.transactionId);
        });
        
        ['pemasukan-foto', 'pengeluaran-foto'].forEach(id => {
            document.getElementById(id).addEventListener('change', e => {
                const preview = document.getElementById(id.replace('foto', 'preview'));
                if (e.target.files && e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        preview.src = ev.target.result;
                        preview.classList.remove('hidden');
                    }
                    reader.readAsDataURL(e.target.files[0]);
                } else {
                    preview.classList.add('hidden');
                }
            });
        });

        document.getElementById('saldo-card').addEventListener('click', () => this.render.showBalanceBreakdown());
        document.getElementById('close-balance-modal-btn').addEventListener('click', () => document.getElementById('balance-breakdown-modal').classList.add('hidden'));
        document.getElementById('close-modal-btn').addEventListener('click', () => document.getElementById('detail-modal').classList.add('hidden'));
        document.getElementById('chart-prev-btn').addEventListener('click', () => { this.chartState.offset++; this.render.renderChart(); });
        document.getElementById('chart-next-btn').addEventListener('click', () => { this.chartState.offset = Math.max(0, this.chartState.offset - 1); this.render.renderChart(); });
        document.getElementById('sort-by-created-at-btn').addEventListener('click', () => { this.reportSortBy = 'createdAt'; this.render.renderLaporan(); });
        document.getElementById('sort-by-tanggal-btn').addEventListener('click', () => { this.reportSortBy = 'tanggal'; this.render.renderLaporan(); });
        document.getElementById('challenge-complete-btn').addEventListener('click', this.ui.handleChallengeComplete);
    }

    resetInactivityTimer() {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            if (this.currentUser) {
                this.ui.showPopup({
                    title: 'Sesi Berakhir',
                    message: 'Anda telah keluar secara otomatis karena tidak ada aktivitas.',
                    icon: 'error',
                    buttons: [{ text: 'OK', action: () => logoutUser() }]
                });
            }
        }, 3600000); // 1 hour
    }
}

new App();

