// File ini adalah inti dari aplikasi Anda.
// Ia mengelola status, data, dan menghubungkan semua bagian (UI, auth, data).

import { auth, db } from './firebase-config.js';
import { initAuth, logOut, inactivityLogout } from './auth.js';
import { 
    showPage, initializeUI, renderAll, showPopup,
    resetInputForms, showTransactionDetails, showBalanceBreakdown 
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
const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        inactivityLogout();
    }, 30 * 60 * 1000); 
};

const setupActivityListeners = () => {
    const activityEvents = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'];
    activityEvents.forEach(event => {
        window.addEventListener(event, resetInactivityTimer, true);
    });
};

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
        showPopup({ title: 'Berhasil!', message: 'Data transaksi telah disimpan, Bos!', icon: 'success', buttons: [{ text: 'Oke', action: () => showPage('beranda', transactions, editingTransactionId) }] });
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
    
    // [FIXED] Panggil semua inisialisasi APLIKASI UTAMA di sini, SETELAH login berhasil.
    listenToTransactions();
    initializeUI(user);
    initAppEventListeners(); // Memasang listener untuk elemen di dalam aplikasi.
    
    setupActivityListeners();
    resetInactivityTimer();
};

const onLogout = () => {
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

// --- EVENT LISTENERS INITIALIZATION for APP ---
const initAppEventListeners = () => {
    // Listener untuk semua tombol navigasi
    document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(btn => {
        if (btn.dataset.page) {
            btn.addEventListener('click', () => {
                showPage(btn.dataset.page, transactions, editingTransactionId);
            });
        }
    });
    
    // Listener untuk kartu saldo
    document.getElementById('saldo-card').addEventListener('click', () => {
        showBalanceBreakdown(transactions);
    });

    // Listener untuk tombol logout
    document.getElementById('logout-btn').addEventListener('click', logOut);
    document.getElementById('logout-btn-mobile').addEventListener('click', logOut);

    // Listener untuk form
    document.getElementById('form-pemasukan').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-pengeluaran').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-transfer').addEventListener('submit', handleFormSubmit);
    
    // Listener untuk aksi di tabel laporan
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

    // Listener untuk filter dan paginasi laporan
    document.getElementById('laporan-bulan').addEventListener('change', () => setReportCurrentPage(1));
    document.getElementById('laporan-tahun').addEventListener('change', () => setReportCurrentPage(1));

    document.getElementById('sort-by-created-at-btn').addEventListener('click', () => setReportSortBy('createdAt'));
    document.getElementById('sort-by-tanggal-btn').addEventListener('click', () => setReportSortBy('tanggal'));

    document.getElementById('pagination-container').addEventListener('click', e => {
        const prevBtn = e.target.closest('#prev-page-btn');
        const nextBtn = e.target.closest('#next-page-btn');
        if (prevBtn && reportCurrentPage > 1) {
            setReportCurrentPage(reportCurrentPage - 1);
        }
        if (nextBtn) {
            const bulan = document.getElementById('laporan-bulan').value;
            const tahun = document.getElementById('laporan-tahun').value;
            const filtered = transactions.filter(t => t.tanggal.getMonth() == bulan && t.tanggal.getFullYear() == tahun);
            const totalPages = Math.ceil(filtered.length / reportItemsPerPage);
            if (reportCurrentPage < totalPages) {
                setReportCurrentPage(reportCurrentPage + 1);
            }
        }
    });

    // Listener untuk tombol ekspor excel
    document.getElementById('export-excel-btn').addEventListener('click', () => {
        generateXLSX(transactions);
    });
};

const generateXLSX = (transactionsToExport) => {
    showPopup({ title: 'Mempersiapkan Excel...', message: 'Mohon tunggu, laporan sedang dibuat.', icon: 'loading' });
    try {
        const bulanSelect = document.getElementById('laporan-bulan');
        const tahunSelect = document.getElementById('laporan-tahun');
        const bulan = bulanSelect.options[bulanSelect.selectedIndex].text;
        const tahun = tahunSelect.value;
        
        const filtered = transactionsToExport.filter(t => t.tanggal.getMonth() == bulanSelect.value && t.tanggal.getFullYear() == tahun);

        if (filtered.length === 0) {
            showPopup({ title: 'Gagal', message: 'Tidak ada data untuk diekspor pada periode ini.', icon: 'error', buttons: [{ text: 'Tutup' }] });
            return;
        }

        const dataToExport = filtered.sort((a, b) => a.tanggal - b.tanggal).map(t => {
            const base = {
                "Tanggal Transaksi": t.tanggal.toLocaleDateString('id-ID'),
                "Waktu Input": t.createdAt ? t.createdAt.toLocaleString('id-ID') : '',
                Tipe: t.type,
                Jumlah: t.jumlah,
                Keterangan: t.keterangan || '',
            };
            if (t.type === 'pemasukan') {
                return {...base, Oleh: t.oleh, "Disimpan Di": t.disimpanDi};
            } else if (t.type === 'pengeluaran') {
                return {...base, Oleh: t.oleh, "Dari Lokasi": t.dariLokasi, Kategori: t.kategori};
            } else { // transfer
                return { ...base, "Dari Dana": t.dariOleh, "Dari Lokasi": t.dari, "Ke Dana": t.keOleh, "Ke Lokasi": t.ke };
            }
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");
        
        const max_width = dataToExport.reduce((w, r) => Math.max(w, ...Object.values(r).map(val => String(val).length)), 10);
        worksheet["!cols"] = Object.keys(dataToExport[0]).map(() => ({ wch: max_width + 2 }));

        XLSX.writeFile(workbook, `laporan-keuangan-${bulan}-${tahun}.xlsx`);
        showPopup({ title: 'Excel Siap!', message: 'Laporan Anda telah berhasil diunduh.', icon: 'success', buttons: [{ text: 'OK' }] });
    } catch (err) {
         showPopup({ title: 'Gagal', message: 'Terjadi kesalahan saat membuat file Excel.', icon: 'error', buttons: [{ text: 'Tutup' }] });
    }
};


// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Hanya inisialisasi Autentikasi saat halaman pertama kali dimuat.
    // Listener lain akan dipasang setelah login berhasil.
    initAuth(onLogin, onLogout);
});

