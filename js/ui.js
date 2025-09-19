import { logoutUser } from './auth.js';
import { saveTransaction, deleteTransaction } from './api.js';

let appState = {}; // Will be populated by main.js

export function initializeUI(state) {
    appState = state;
    feather.replace();
    // The main event listeners are now in main.js to have access to the full app state
}

export function showPage(pageId) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    
    const pageToShow = document.getElementById(pageId + '-page');
    if (pageToShow) {
        pageToShow.classList.remove('hidden');
    }

    const navButtons = document.querySelectorAll('.nav-btn, .bottom-nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));

    let activePage = pageId;
    if (['dukungan', 'review'].includes(pageId)) {
        activePage = 'lainnya';
    }

    document.querySelectorAll(`.nav-btn[data-page='${activePage}']`).forEach(b => b.classList.add('active'));
    document.querySelectorAll(`.bottom-nav-btn[data-page='${activePage}']`).forEach(b => b.classList.add('active'));
    
    if (pageId !== 'input' || !appState.editingTransactionId) {
        resetInputForms();
    }
}

export function switchForm(formType) {
    ['pemasukan', 'pengeluaran', 'transfer'].forEach(type => {
        document.getElementById(`form-${type}`).classList.toggle('hidden', type !== formType);
        document.getElementById(`${type}-tab`).classList.toggle('active', type === formType);
        document.getElementById(`${type}-tab`).classList.toggle('text-gray-500', type !== formType);
    });
}

export function resetInputForms() {
    appState.editingTransactionId = null;
    ['form-pemasukan', 'form-pengeluaran', 'form-transfer'].forEach(id => document.getElementById(id).reset());
    ['pemasukan-preview', 'pengeluaran-preview'].forEach(id => {
        const preview = document.getElementById(id);
        if (preview) {
            preview.src = '';
            preview.classList.add('hidden');
        }
    });
    
    document.getElementById('pemasukan-submit-btn').firstElementChild.textContent = "Simpan Pemasukan";
    document.getElementById('pengeluaran-submit-btn').textContent = "Simpan Pengeluaran";
    document.getElementById('transfer-submit-btn').textContent = "Simpan Transfer";

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pemasukan-tanggal').value = today;
    document.getElementById('pengeluaran-tanggal').value = today;
    document.getElementById('transfer-tanggal').value = today;
}

export function showPopup(config) {
    const popupModal = document.getElementById('popup-modal');
    document.getElementById('popup-title').textContent = config.title;
    document.getElementById('popup-message').textContent = config.message;
    const popupLoader = document.getElementById('popup-loader');
    const popupIcon = document.getElementById('popup-icon');
    const popupBtnContainer = document.getElementById('popup-button-container');

    popupLoader.classList.toggle('hidden', config.icon !== 'loading');
    popupIcon.innerHTML = '';
    if (config.icon === 'success') popupIcon.innerHTML = `<i data-feather="check-circle" class="w-12 h-12 text-green-500"></i>`;
    if (config.icon === 'error') popupIcon.innerHTML = `<i data-feather="x-circle" class="w-12 h-12 text-red-500"></i>`;
    
    popupBtnContainer.innerHTML = '';
    if (config.buttons && config.buttons.length > 0) {
        config.buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.textContent = btnInfo.text;
            button.className = `w-full font-bold py-2 px-4 rounded-lg transition-all duration-300 ${btnInfo.class || 'bg-indigo-600 hover:bg-indigo-700 text-white'}`;
            button.onclick = () => {
                popupModal.classList.add('hidden');
                if (btnInfo.action) btnInfo.action();
            };
            popupBtnContainer.appendChild(button);
        });
    }
    popupModal.classList.remove('hidden');
    feather.replace();
}

export function showLogoutConfirmation() {
    showPopup({
        title: 'Konfirmasi Keluar',
        message: 'Yakin ingin keluar dari akun ini?',
        icon: 'error',
        buttons: [
            { text: 'Batal', class: 'bg-gray-200 hover:bg-gray-300 text-gray-800' },
            { text: 'Ya, Keluar', class: 'bg-red-600 hover:bg-red-700 text-white', action: logoutUser }
        ]
    });
}

export async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    showPopup({ title: appState.editingTransactionId ? 'Memperbarui...' : 'Menyimpan...', message: 'Mohon tunggu sebentar.', icon: 'loading' });

    try {
        const isPemasukan = form.id === 'form-pemasukan';
        const isPengeluaran = form.id === 'form-pengeluaran';
        
        let transactionData = {
            jumlah: parseFloat(form.querySelector('input[type="number"]').value),
            keterangan: form.querySelector('input[id*="-keterangan"]').value || '',
            tanggal: form.querySelector('input[type="date"]').value,
        };
        
        const fotoInput = form.querySelector('input[type="file"]');
        if (fotoInput) {
            transactionData.fotoFile = fotoInput.files[0] || null;
        }

        if (isPemasukan || isPengeluaran) {
            transactionData.type = isPemasukan ? 'pemasukan' : 'pengeluaran';
            transactionData.oleh = form.querySelector('select[id*="-oleh"]').value;
            if (isPemasukan) {
                transactionData.disimpanDi = document.getElementById('pemasukan-disimpan').value;
            } else {
                transactionData.kategori = document.getElementById('pengeluaran-kategori').value;
                transactionData.dariLokasi = document.getElementById('pengeluaran-dari-lokasi').value;
            }
        } else { // Transfer
            transactionData.type = 'transfer';
            transactionData.dari = document.getElementById('transfer-dari').value;
            transactionData.ke = document.getElementById('transfer-ke').value;
            transactionData.dariOleh = document.getElementById('transfer-dari-oleh').value;
            transactionData.keOleh = document.getElementById('transfer-ke-oleh').value;
        }

        const oldTransaction = appState.transactions.find(t => t.id === appState.editingTransactionId);
        if (oldTransaction && !transactionData.fotoFile) {
            transactionData.existingFotoUrl = oldTransaction.foto;
        }
        
        await saveTransaction(appState.currentUser.uid, transactionData, appState.editingTransactionId);

        resetInputForms();
        showPopup({ title: 'Berhasil!', message: 'Data transaksi telah disimpan.', icon: 'success', buttons: [{ text: 'Oke' }] });

    } catch (error) {
        console.error("Form submit error:", error);
        showPopup({ title: 'Gagal Menyimpan', message: `Terjadi kesalahan: ${error.message}`, icon: 'error', buttons: [{ text: 'Tutup' }] });
    }
}

export function handleDeleteClick(transactionId) {
    showPopup({
        title: 'Konfirmasi Hapus',
        message: 'Anda yakin ingin menghapus transaksi ini? Tindakan ini tidak dapat dibatalkan.',
        icon: 'error',
        buttons: [
            { text: 'Batal', class: 'bg-gray-200 hover:bg-gray-300 text-gray-800' },
            { 
                text: 'Ya, Hapus', 
                class: 'bg-red-600 hover:bg-red-700 text-white', 
                action: async () => {
                    try {
                        await deleteTransaction(appState.currentUser.uid, transactionId);
                        showPopup({ title: 'Dihapus', message: 'Transaksi telah berhasil dihapus.', icon: 'success', buttons: [{ text: 'OK' }] });
                    } catch (error) {
                        showPopup({ title: 'Gagal', message: 'Gagal menghapus transaksi.', icon: 'error', buttons: [{ text: 'Tutup' }] });
                    }
                }
            }
        ]
    });
}

export function handleEditClick(transactionId) {
    const t = appState.transactions.find(tr => tr.id === transactionId);
    if (!t) return;
    appState.editingTransactionId = transactionId;
    
    showPage('input');
    switchForm(t.type);

    const form = document.getElementById(`form-${t.type}`);
    form.querySelector('[type=date]').value = new Date(t.tanggal.getTime() - (t.tanggal.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
    form.querySelector('[type=number]').value = t.jumlah;
    form.querySelector('input[id*="-keterangan"]').value = t.keterangan || '';

    if (t.type === 'pemasukan' || t.type === 'pengeluaran') {
        form.querySelector('select[id*="-oleh"]').value = t.oleh;
        const preview = document.getElementById(`${t.type}-preview`);
        if (t.foto) {
            preview.src = t.foto;
            preview.classList.remove('hidden');
        }
        if (t.type === 'pemasukan') {
            document.getElementById('pemasukan-disimpan').value = t.disimpanDi;
            document.getElementById('pemasukan-submit-btn').firstElementChild.textContent = "Perbarui Pemasukan";
        } else {
            document.getElementById('pengeluaran-kategori').value = t.kategori;
            document.getElementById('pengeluaran-dari-lokasi').value = t.dariLokasi || '';
            document.getElementById('pengeluaran-submit-btn').textContent = "Perbarui Pengeluaran";
        }
    } else if (t.type === 'transfer') {
        document.getElementById('transfer-dari').value = t.dari;
        document.getElementById('transfer-ke').value = t.ke;
        document.getElementById('transfer-dari-oleh').value = t.dariOleh;
        document.getElementById('transfer-ke-oleh').value = t.keOleh;
        document.getElementById('transfer-submit-btn').textContent = "Perbarui Transfer";
    }
}

export function handleChallengeComplete() {
    const today = new Date().toDateString();
    localStorage.setItem('challengeCompletedToday', 'true');
    localStorage.setItem('lastChallengeDay', today);
    let count = parseInt(localStorage.getItem('completedChallenges') || '0', 10);
    count++;
    localStorage.setItem('completedChallenges', count);
    
    // Re-render dashboard to show changes
    appState.render.renderDashboard();

    showPopup({ title: 'Tantangan Selesai!', message: 'Anda berhasil menyelesaikan tantangan hari ini. Hebat!', icon: 'success', buttons: [{ text: 'OK' }] });
}

