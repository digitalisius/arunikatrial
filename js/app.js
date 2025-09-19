// File ini adalah inti dari aplikasi Anda.
// Ia mengelola status, data, dan menghubungkan semua bagian (UI, auth, data).

import { auth, db } from './firebase-config.js';
import { initAuth, logOut, inactivityLogout } from './auth.js';
import { 
    showPage, initializeUI, renderAll, showPopup, hidePopup,
    resetInputForms, showTransactionDetails 
} from './ui.js';
import { 
    collection, addDoc, onSnapshot, query, Timestamp, 
    doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let transactions = [];
let currentUser = null;
let unsubscribeFromFirestore = null;
let editingTransactionId = null;
let reportCurrentPage = 1;
const reportItemsPerPage = 10;
let reportSortBy = 'createdAt';
let inactivityTimer;

// --- CONFIGURATION ---
const CLOUDINARY_CLOUD_NAME = 'dtvmbvwtx';
const CLOUDINARY_UPLOAD_PRESET = 'dompet';

// --- INACTIVITY LOGIC ---
/**
 * Mereset timer setiap kali ada aktivitas pengguna.
 */
const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer);
    // Logout setelah 30 menit (30 * 60 * 1000 ms)
    inactivityTimer = setTimeout(() => {
        inactivityLogout();
    }, 30 * 60 * 1000); 
};

/**
 * Memasang event listener untuk mendeteksi aktivitas pengguna.
 */
const setupActivityListeners = () => {
    const activityEvents = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    activityEvents.forEach(event => {
        window.addEventListener(event, resetInactivityTimer, true);
    });
};

/**
 * Melepas event listener saat pengguna logout.
 */
const removeActivityListeners = () => {
    const activityEvents = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer, true);
    });
    clearTimeout(inactivityTimer);
};


// --- DATA LOGIC ---
const listenToTransactions = () => {
    if (!currentUser) return;
    const q = query(collection(db, 'users', currentUser.uid, 'transactions'));
    unsubscribeFromFirestore = onSnapshot(q, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ 
            ...doc.data(), 
            id: doc.id, 
            tanggal: doc.data().tanggal.toDate(), 
            createdAt: doc.data().createdAt?.toDate() 
        }));
        renderAll(transactions, reportCurrentPage, reportItemsPerPage, reportSortBy);
    }, (error) => console.error("Gagal mengambil data:", error));
};

const compressImage = (file, maxSizeInKB = 200, quality = 0.9) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1280;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob.size / 1024 <= maxSizeInKB) {
                        resolve(blob);
                    } else if (quality > 0.15) {
                        resolve(compressImage(file, maxSizeInKB, quality - 0.1));
                    } else {
                        resolve(blob);
                    }
                }, 'image/jpeg', quality);
            };
        };
        reader.onerror = error => reject(error);
    });
};

const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (data.secure_url) return data.secure_url;
    else throw new Error('Cloudinary upload failed');
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const isPemasukan = form.id === 'form-pemasukan';
    const isPengeluaran = form.id === 'form-pengeluaran';
    const isTransfer = form.id === 'form-transfer';
    showPopup({ title: editingTransactionId ? 'Memperbarui...' : 'Menyimpan...', message: 'Mohon tunggu sebentar.', icon: 'loading' });

    try {
        let transactionData = {
            tanggal: form.querySelector('[type=date]').value,
            jumlah: parseFloat(form.querySelector('[type=number]').value),
            keterangan: form.querySelector('input[id*="-keterangan"]').value || '',
            updatedAt: Timestamp.now()
        };

        if (isPemasukan || isPengeluaran) {
            transactionData.type = isPemasukan ? 'pemasukan' : 'pengeluaran';
            transactionData.oleh = form.querySelector('select[id*="-oleh"]').value;
            transactionData.foto = null;
            const fotoInput = form.querySelector('input[type=file]');
            if (fotoInput?.files?.[0]) {
                const compressedFile = await compressImage(fotoInput.files[0]);
                transactionData.foto = await uploadToCloudinary(compressedFile);
            } else if (editingTransactionId) {
                const oldTransaction = transactions.find(t => t.id === editingTransactionId);
                transactionData.foto = oldTransaction.foto || null;
            }
            if (isPemasukan) {
                transactionData.disimpanDi = document.getElementById('pemasukan-disimpan').value;
            } else {
                transactionData.kategori = document.getElementById('pengeluaran-kategori').value;
                transactionData.dariLokasi = document.getElementById('pengeluaran-dari-lokasi').value;
            }
        } else if (isTransfer) {
            transactionData.type = 'transfer';
            transactionData.dari = document.getElementById('transfer-dari').value;
            transactionData.ke = document.getElementById('transfer-ke').value;
            transactionData.dariOleh = document.getElementById('transfer-dari-oleh').value;
            transactionData.keOleh = document.getElementById('transfer-ke-oleh').value;
        }

        if (editingTransactionId) {
            await updateDoc(doc(db, 'users', currentUser.uid, 'transactions', editingTransactionId), { ...transactionData, tanggal: Timestamp.fromDate(new Date(transactionData.tanggal)) });
        } else {
            transactionData.createdAt = Timestamp.now();
            await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), { ...transactionData, tanggal: Timestamp.fromDate(new Date(transactionData.tanggal)) });
        }
        
        setEditingTransactionId(null);
        resetInputForms();
        showPopup({ title: 'Berhasil!', message: 'Data transaksi telah disimpan, Bos!', icon: 'success', buttons: [{ text: 'Oke', action: () => showPage('beranda', transactions) }] });
    } catch (error) {
        console.error("Form submit error:", error);
        showPopup({ title: 'Gagal Menyimpan', message: 'Terjadi kesalahan. Silakan coba lagi.', icon: 'error', buttons: [{ text: 'Tutup' }] });
    }
};

const handleDeleteTransaction = (transactionId) => {
    showPopup({
        title: 'Konfirmasi Hapus', message: 'Anda yakin ingin menghapus transaksi ini? Tindakan ini tidak dapat dibatalkan.', icon: 'error',
        buttons: [
            { text: 'Batal', class: 'bg-gray-200 hover:bg-gray-300 text-gray-800' },
            { text: 'Ya, Hapus', class: 'bg-red-600 hover:bg-red-700 text-white', action: async () => {
                try {
                    await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', transactionId));
                    showPopup({title: 'Dihapus', message: 'Transaksi telah dihapus.', icon: 'success', buttons: [{text: 'OK'}]});
                } catch (error) {
                    showPopup({title: 'Gagal', message: 'Gagal menghapus transaksi.', icon: 'error', buttons: [{text: 'Tutup'}]});
                }
            }}
        ]
    });
};

// --- AUTH CALLBACKS ---
const onLogin = (user) => {
    currentUser = user;
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    listenToTransactions();
    initializeUI(user);
    // Memulai deteksi inaktivitas
    setupActivityListeners();
    resetInactivityTimer();
};

const onLogout = () => {
    // Menghentikan deteksi inaktivitas
    removeActivityListeners();
    currentUser = null;
    transactions = [];
    if (unsubscribeFromFirestore) unsubscribeFromFirestore();
    document.getElementById('login-page').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    renderAll([], 1, 10, 'createdAt');
};

// --- SETTERS for state ---
const setReportCurrentPage = (page) => {
    reportCurrentPage = page;
    renderAll(transactions, reportCurrentPage, reportItemsPerPage, reportSortBy);
};

const setReportSortBy = (sortBy) => {
    reportSortBy = sortBy;
    document.getElementById('report-sort-modal').classList.add('hidden');
    setReportCurrentPage(1);
};

const setEditingTransactionId = (id) => {
    editingTransactionId = id;
};

// --- EVENT LISTENERS INITIALIZATION ---
const initEventListeners = () => {
    // [FIXED] Event listener untuk semua tombol navigasi
    document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
        // Hanya tambahkan listener jika tombol memiliki 'data-page'
        if (btn.dataset.page) {
            btn.addEventListener('click', () => {
                showPage(btn.dataset.page, transactions, editingTransactionId);
            });
        }
    });

    document.getElementById('logout-btn').addEventListener('click', logOut);
    document.getElementById('logout-btn-mobile').addEventListener('click', logOut);

    document.getElementById('form-pemasukan').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-pengeluaran').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-transfer').addEventListener('submit', handleFormSubmit);
    
    document.getElementById('laporan-tabel').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const row = e.target.closest('tr[data-transaction-id]');

        if (editBtn) {
            e.stopPropagation();
            setEditingTransactionId(editBtn.dataset.id);
            showPage('input', transactions, editingTransactionId);
        } else if (deleteBtn) {
            e.stopPropagation();
            handleDeleteTransaction(deleteBtn.dataset.id);
        } else if (row) {
            showTransactionDetails(row.dataset.transactionId, transactions);
        }
    });

    document.getElementById('laporan-bulan').addEventListener('change', () => setReportCurrentPage(1));
    document.getElementById('laporan-tahun').addEventListener('change', () => setReportCurrentPage(1));

    document.getElementById('sort-by-created-at-btn').addEventListener('click', () => setReportSortBy('createdAt'));
    document.getElementById('sort-by-tanggal-btn').addEventListener('click', () => setReportSortBy('tanggal'));

    document.getElementById('pagination-container').addEventListener('click', e => {
        const prevBtn = e.target.closest('#prev-page-btn');
        const nextBtn = e.target.closest('#next-page-btn');
        if (prevBtn && reportCurrentPage > 1) setReportCurrentPage(reportCurrentPage - 1);
        if (nextBtn) {
            const totalPages = Math.ceil(transactions.filter(t => t.tanggal.getMonth() == document.getElementById('laporan-bulan').value && t.tanggal.getFullYear() == document.getElementById('laporan-tahun').value).length / reportItemsPerPage);
            if(reportCurrentPage < totalPages) setReportCurrentPage(reportCurrentPage + 1);
        }
    });
};

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initAuth(onLogin, onLogout);
    initEventListeners();
});

