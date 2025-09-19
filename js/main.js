import { setupAuthListeners, showLogoutConfirmation } from './auth.js';
import { listenToTransactions, saveTransaction, deleteTransaction } from './api.js';
import { showPage, switchForm, formatRupiah, showPopup, hidePopup, setupModalListeners, resetInputForms, showConfetti } from './ui.js';

// --- GLOBAL STATE ---
let transactions = [];
let financialChart;
let currentUser = null;
let unsubscribeFromFirestore = null;
let chartState = { monthsToShow: 6, offset: 0 };
let editingTransactionId = null;
let reportCurrentPage = 1;
const reportItemsPerPage = 10;
let prevSaldo = 0;
let reportSortBy = 'createdAt';

// --- RENDERING FUNCTIONS ---

function renderDashboard() {
    const totalPemasukan = transactions.filter(t => t.type === 'pemasukan').reduce((s, t) => s + t.jumlah, 0);
    const totalPengeluaran = transactions.filter(t => t.type === 'pengeluaran').reduce((s, t) => s + t.jumlah, 0);
    const currentSaldo = totalPemasukan - totalPengeluaran;
    document.getElementById('total-pemasukan').textContent = formatRupiah(totalPemasukan);
    document.getElementById('total-pengeluaran').textContent = formatRupiah(totalPengeluaran);
    document.getElementById('saldo-saat-ini').textContent = formatRupiah(currentSaldo);

    const motivationalMessageEl = document.getElementById('motivational-message');
    if (currentSaldo > 0) {
        motivationalMessageEl.textContent = "Kerja bagus! Keuanganmu dalam kondisi baik bulan ini. Pertahankan!";
        motivationalMessageEl.className = 'text-center font-medium text-green-600';
    } else if (currentSaldo < 0) {
        motivationalMessageEl.textContent = "Tetap semangat! Mari kita perbaiki pengeluaran bulan ini.";
        motivationalMessageEl.className = 'text-center font-medium text-red-600';
    } else {
        motivationalMessageEl.textContent = "Keuanganmu seimbang. Mari mulai menabung bulan ini!";
        motivationalMessageEl.className = 'text-center font-medium text-gray-700';
    }

    setDailyChallenge();
    renderConsistencyTracker();

    const recentList = document.getElementById('recent-transactions-list');
    recentList.innerHTML = '';
    const sortedForRecent = transactions.slice().sort((a, b) => (b.createdAt || b.tanggal) - (a.createdAt || a.tanggal));

    if (transactions.length === 0) {
        recentList.innerHTML = `<p class="text-gray-500 text-center py-4">Belum ada aktivitas.</p>`;
        return;
    }

    sortedForRecent.slice(0, 5).forEach(t => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors';
        item.setAttribute('data-transaction-id', t.id);
        let iconHtml, textHtml, amountHtml;
        if (t.type === 'pemasukan') {
            iconHtml = `<div class="p-2 rounded-full bg-green-100"><i data-feather="chevrons-down" class="w-5 h-5 text-green-600"></i></div>`;
            textHtml = `<p class="font-semibold text-gray-800">${t.keterangan}</p><p class="text-xs text-gray-500">Oleh: ${t.oleh}</p>`;
            amountHtml = `<p class="font-bold text-green-600">${formatRupiah(t.jumlah)}</p>`;
        } else if (t.type === 'pengeluaran') {
            iconHtml = `<div class="p-2 rounded-full bg-red-100"><i data-feather="chevrons-up" class="w-5 h-5 text-red-600"></i></div>`;
            textHtml = `<p class="font-semibold text-gray-800">${t.keterangan}</p><p class="text-xs text-gray-500">Dari: ${t.dariLokasi} (${t.oleh})</p>`;
            amountHtml = `<p class="font-bold text-red-600">${formatRupiah(t.jumlah)}</p>`;
        } else { // transfer
            iconHtml = `<div class="p-2 rounded-full bg-blue-100"><i data-feather="repeat" class="w-5 h-5 text-blue-600"></i></div>`;
            textHtml = `<p class="font-semibold text-gray-800">Transfer Dana</p><p class="text-xs text-gray-500">${t.dari} (${t.dariOleh}) → ${t.ke} (${t.keOleh})</p>`;
            amountHtml = `<p class="font-bold text-blue-600">${formatRupiah(t.jumlah)}</p>`;
        }
        item.innerHTML = `<div class="flex items-center space-x-3 pointer-events-none">${iconHtml}<div>${textHtml}</div></div>${amountHtml}`;
        recentList.appendChild(item);
    });
    feather.replace();
}

function renderChart() {
    const ctx = document.getElementById('financialChart').getContext('2d');
    const allMonths = [...new Set(transactions.map(t => `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}`))].sort();
    const endIndex = allMonths.length - (chartState.offset * chartState.monthsToShow);
    const startIndex = Math.max(0, endIndex - chartState.monthsToShow);
    const visibleMonths = allMonths.slice(startIndex, endIndex);
    const labels = visibleMonths.map(m => {
        const [y, mo] = m.split('-');
        return new Date(y, mo - 1).toLocaleString('id-ID', { month: 'short', year: 'numeric' });
    });
    const incomeData = visibleMonths.map(m => transactions.filter(t => t.type === 'pemasukan' && `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}` === m).reduce((s, t) => s + t.jumlah, 0));
    const expenseData = visibleMonths.map(m => transactions.filter(t => t.type === 'pengeluaran' && `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}` === m).reduce((s, t) => s + t.jumlah, 0));
    if (financialChart) financialChart.destroy();
    financialChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Pemasukan', data: incomeData, backgroundColor: '#81e6d9' }, { label: 'Pengeluaran', data: expenseData, backgroundColor: '#fecaca' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => v >= 1e6 ? `Rp ${v/1e6}jt` : (v >= 1e3 ? `Rp ${v/1e3}rb` : `Rp ${v}`) } } },
            plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatRupiah(c.parsed.y)}` } } }
        }
    });
    document.getElementById('chart-next-btn').disabled = chartState.offset === 0;
    document.getElementById('chart-prev-btn').disabled = startIndex === 0;
}

function renderLaporan() {
    const bulan = document.getElementById('laporan-bulan').value;
    const tahun = document.getElementById('laporan-tahun').value;

    let filtered = transactions
        .filter(t => t.tanggal.getMonth() == bulan && t.tanggal.getFullYear() == tahun);

    filtered.sort((a, b) => {
        const dateA = reportSortBy === 'createdAt' ? a.createdAt || a.tanggal : a.tanggal;
        const dateB = reportSortBy === 'createdAt' ? b.createdAt || b.tanggal : b.tanggal;
        return dateB - dateA;
    });

    const p = filtered.filter(t => t.type === 'pemasukan').reduce((s, t) => s + t.jumlah, 0);
    const pg = filtered.filter(t => t.type === 'pengeluaran').reduce((s, t) => s + t.jumlah, 0);
    document.getElementById('laporan-pemasukan').textContent = formatRupiah(p);
    document.getElementById('laporan-pengeluaran').textContent = formatRupiah(pg);
    document.getElementById('laporan-selisih').textContent = formatRupiah(p - pg);
    const tabelBody = document.getElementById('laporan-tabel');
    tabelBody.innerHTML = '';

    const totalPages = Math.ceil(filtered.length / reportItemsPerPage);
    const paginatedItems = filtered.slice((reportCurrentPage - 1) * reportItemsPerPage, reportCurrentPage * reportItemsPerPage);

    if (paginatedItems.length === 0) {
        tabelBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">Tidak ada data untuk periode ini.</td></tr>`;
        renderPaginationControls(0, 0);
        return;
    }

    paginatedItems.forEach(t => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-200/80 hover:bg-gray-50 cursor-pointer';
        row.setAttribute('data-transaction-id', t.id);

        let keterangan, tipe, jumlah, tanggal;

        const time = t.createdAt ? t.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(t.createdAt.getMilliseconds()).padStart(3, '0') : '';
        tanggal = `<span>${t.tanggal.toLocaleDateString('id-ID')}</span><small class="text-gray-400 block">${time}</small>`;

        if (t.type === 'transfer') {
            keterangan = `<span>Transfer: <b>${t.dari}</b> (${t.dariOleh}) → <b>${t.ke}</b> (${t.keOleh})</span> ${t.keterangan ? `<small class="text-gray-500">${t.keterangan}</small>` : ''}`;
            tipe = `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Transfer</span>`;
            jumlah = `${formatRupiah(t.jumlah)}`;
        } else {
            const isIncome = t.type === 'pemasukan';
            let detailSumber = isIncome ? `Disimpan di: ${t.disimpanDi}` : `Dari: ${t.dariLokasi || '?'}`;
            keterangan = `<span>${t.keterangan}</span><small class="text-gray-500">${detailSumber} (${t.oleh})</small>`;
            tipe = `<span class="px-2 py-1 rounded-full text-xs font-semibold ${isIncome ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${t.type}</span>`;
            jumlah = `${formatRupiah(t.jumlah)}`;
        }

        row.innerHTML = `<td data-label="Tanggal">${tanggal}</td>
                         <td data-label="Keterangan">${keterangan}</td>
                         <td data-label="Tipe">${tipe}</td>
                         <td data-label="Jumlah" class="${t.type === 'pemasukan' ? 'text-green-600' : t.type === 'pengeluaran' ? 'text-red-600' : 'text-blue-600'} font-semibold">${jumlah}</td>
                         <td data-label="Aksi" class="text-center">
                            <button class="edit-btn p-1 text-indigo-500 hover:text-indigo-700" data-id="${t.id}"><i data-feather="edit-2" class="w-4 h-4 pointer-events-none"></i></button>
                            <button class="delete-btn p-1 text-red-500 hover:text-red-700" data-id="${t.id}"><i data-feather="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
                         </td>`;
        tabelBody.appendChild(row);
    });
    feather.replace();
    renderPaginationControls(totalPages, filtered.length);
}

function renderAll() {
    renderDashboard();
    renderChart();
    if (!document.getElementById('laporan-page').classList.contains('hidden')) {
        renderLaporan();
    }
}

// --- CHALLENGE FUNCTIONS ---
const challengeList = [
    "Catat semua pengeluaran kecilmu hari ini!", "Tinjau kembali pengeluaran terbesar Anda dalam seminggu terakhir.",
    "Coba identifikasi satu pengeluaran yang tidak perlu hari ini.", "Tulis satu tujuan keuangan kecil yang ingin Anda capai minggu ini.",
    "Lakukan pencatatan keuangan dua kali hari ini, pagi dan malam!", "Puji dirimu sendiri atas setiap pencatatan yang sudah kamu lakukan. Kamu hebat!",
    "Periksa saldo Anda saat ini dan rencanakan langkah selanjutnya.",
];

function setDailyChallenge() {
    const challengeMessageEl = document.getElementById('challenge-message');
    const challengeCompleteBtn = document.getElementById('challenge-complete-btn');
    const challengeCountEl = document.getElementById('challenge-count');
    const today = new Date().toDateString();
    const lastChallengeDay = localStorage.getItem('lastChallengeDay');
    let lastChallengeIndex = localStorage.getItem('lastChallengeIndex');
    const challengeCompletedToday = localStorage.getItem('challengeCompletedToday') === 'true' && lastChallengeDay === today;

    if (lastChallengeDay !== today) {
        lastChallengeIndex = Math.floor(Math.random() * challengeList.length);
        localStorage.setItem('lastChallengeDay', today);
        localStorage.setItem('lastChallengeIndex', lastChallengeIndex);
        localStorage.setItem('challengeCompletedToday', 'false');
    }

    challengeMessageEl.textContent = challengeList[lastChallengeIndex];
    if (challengeCompletedToday) {
        challengeCompleteBtn.style.display = 'none';
        challengeMessageEl.textContent += " (Tantangan Selesai!)";
    } else {
        challengeCompleteBtn.style.display = 'inline-block';
    }

    const count = parseInt(localStorage.getItem('completedChallenges') || '0', 10);
    challengeCountEl.textContent = `Anda telah menyelesaikan ${count} tantangan.`;
}

function completeChallenge() {
    localStorage.setItem('challengeCompletedToday', 'true');
    let count = parseInt(localStorage.getItem('completedChallenges') || '0', 10);
    count++;
    localStorage.setItem('completedChallenges', count);
    renderDashboard();
    showPopup({ title: 'Tantangan Selesai!', message: 'Anda berhasil menyelesaikan tantangan hari ini. Hebat!', icon: 'success', buttons: [{ text: 'OK' }] });
}

function renderConsistencyTracker() {
    const consistencyTrackerEl = document.getElementById('consistency-tracker');
    if (!currentUser) return;
    consistencyTrackerEl.innerHTML = '';

    const daysInWeek = 7;
    const now = new Date();
    const daysData = {};

    for (let i = 0; i < daysInWeek; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        daysData[dateString] = false;
    }

    transactions.forEach(t => {
        if (t.createdAt) {
            const dateString = t.createdAt.toISOString().split('T')[0];
            if (daysData[dateString] !== undefined) {
                daysData[dateString] = true;
            }
        }
    });

    Object.keys(daysData).sort().forEach(dateString => {
        const date = new Date(dateString);
        const dayName = date.toLocaleDateString('id-ID', { weekday: 'short' });
        const hasEntry = daysData[dateString];
        const dayDiv = document.createElement('div');
        dayDiv.className = `flex flex-col items-center flex-1 space-y-1 p-2 rounded-lg transition-all duration-300 ${hasEntry ? 'bg-indigo-200' : 'bg-gray-200'}`;
        dayDiv.innerHTML = `<span class="text-xs font-medium">${dayName}</span>
                            <span class="text-xs ${hasEntry ? 'text-indigo-800' : 'text-gray-500'}">${hasEntry ? '✓' : '—'}</span>`;
        consistencyTrackerEl.appendChild(dayDiv);
    });
}


// --- FORM & DATA HANDLING ---

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const type = form.id.split('-')[1];

    showPopup({ title: editingTransactionId ? 'Memperbarui...' : 'Menyimpan...', message: 'Mohon tunggu sebentar.', icon: 'loading' });

    try {
        let transactionData = {
            type,
            tanggal: form.querySelector('[type=date]').value,
            jumlah: parseFloat(form.querySelector('[type=number]').value),
            keterangan: form.querySelector('input[id*="-keterangan"]')?.value || '',
        };

        const fotoInput = form.querySelector('input[type=file]');
        if (fotoInput && fotoInput.files && fotoInput.files[0]) {
            transactionData.fotoFile = fotoInput.files[0];
        }

        if (type === 'pemasukan') {
            transactionData.oleh = form.querySelector('#pemasukan-oleh').value;
            transactionData.disimpanDi = form.querySelector('#pemasukan-disimpan').value;
        } else if (type === 'pengeluaran') {
            transactionData.oleh = form.querySelector('#pengeluaran-oleh').value;
            transactionData.kategori = form.querySelector('#pengeluaran-kategori').value;
            transactionData.dariLokasi = form.querySelector('#pengeluaran-dari-lokasi').value;
        } else if (type === 'transfer') {
            transactionData.dari = form.querySelector('#transfer-dari').value;
            transactionData.ke = form.querySelector('#transfer-ke').value;
            transactionData.dariOleh = form.querySelector('#transfer-dari-oleh').value;
            transactionData.keOleh = form.querySelector('#transfer-ke-oleh').value;
        }

        let oldFotoUrl = null;
        if (editingTransactionId) {
            const oldTransaction = transactions.find(t => t.id === editingTransactionId);
            oldFotoUrl = oldTransaction.foto || null;
        }

        await saveTransaction(currentUser.uid, transactionData, editingTransactionId, oldFotoUrl);

        const currentSaldo = transactions.filter(t => t.type === 'pemasukan').reduce((s, t) => s + t.jumlah, 0) - transactions.filter(t => t.type === 'pengeluaran').reduce((s, t) => s + t.jumlah, 0);
        if (currentSaldo > 0 && prevSaldo <= 0) {
            showConfetti();
        }
        prevSaldo = currentSaldo;

        resetInputForms();
        editingTransactionId = null;
        showPage('input');
        showPopup({ title: 'Berhasil!', message: 'Data transaksi telah disimpan, Bos!', icon: 'success', buttons: [{ text: 'Oke' }] });

    } catch (error) {
        console.error("Form submit error:", error);
        showPopup({ title: 'Gagal Menyimpan', message: 'Terjadi kesalahan. Silakan coba lagi.', icon: 'error', buttons: [{ text: 'Tutup' }] });
    }
}

function handleDeleteTransaction(transactionId) {
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
                        await deleteTransaction(currentUser.uid, transactionId);
                        showPopup({ title: 'Dihapus', message: 'Transaksi telah dihapus.', icon: 'success', buttons: [{ text: 'OK' }] });
                    } catch (error) {
                        showPopup({ title: 'Gagal', message: 'Gagal menghapus transaksi.', icon: 'error', buttons: [{ text: 'Tutup' }] });
                    }
                }
            }
        ]
    });
}

function handleEditTransaction(transactionId) {
    const t = transactions.find(tr => tr.id === transactionId);
    if (!t) return;
    editingTransactionId = transactionId;
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
        } else {
            preview.classList.add('hidden');
        }

        if (t.type === 'pemasukan') {
            form.querySelector('input[id*="-disimpan"]').value = t.disimpanDi;
            document.getElementById('pemasukan-submit-btn').firstElementChild.textContent = "Perbarui Pemasukan";
        } else {
            form.querySelector('select[id*="-kategori"]').value = t.kategori;
            form.querySelector('input[id*="-dari-lokasi"]').value = t.dariLokasi || '';
            document.getElementById('pengeluaran-submit-btn').textContent = "Perbarui Pengeluaran";
        }
    } else if (t.type === 'transfer') {
        form.querySelector('input[id*="-dari"]').value = t.dari;
        form.querySelector('input[id*="-ke"]').value = t.ke;
        form.querySelector('#transfer-dari-oleh').value = t.dariOleh;
        form.querySelector('#transfer-ke-oleh').value = t.keOleh;
        document.getElementById('transfer-submit-btn').textContent = "Perbarui Transfer";
    }
}

// --- UI HELPER FUNCTIONS ---

function showTransactionDetails(transactionId) {
    const t = transactions.find(tr => tr.id == transactionId);
    if (!t) return;
    document.getElementById('modal-title').textContent = t.type === 'transfer' ? `Transfer Dana` : t.keterangan;
    let detailsHtml = `<p><strong class="font-medium text-gray-500 w-28 inline-block">Jumlah:</strong> <span class="font-bold ${t.type === 'pemasukan' ? 'text-green-600' : t.type === 'pengeluaran' ? 'text-red-600' : 'text-blue-600'}">${formatRupiah(t.jumlah)}</span></p>
                     <p><strong class="font-medium text-gray-500 w-28 inline-block">Tanggal:</strong> ${t.tanggal.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`;
    if (t.createdAt) {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Waktu Input:</strong> ${t.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(t.createdAt.getMilliseconds()).padStart(3, '0')}</p>`;
    }
    if (t.type === 'pemasukan') {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Oleh:</strong> ${t.oleh}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Disimpan di:</strong> ${t.disimpanDi}</p>`;
    } else if (t.type === 'pengeluaran') {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari Dana:</strong> ${t.oleh}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari Lokasi:</strong> ${t.dariLokasi}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Kategori:</strong> ${t.kategori}</p>`;
    } else if (t.type === 'transfer') {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari Dana:</strong> ${t.dariOleh}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari Lokasi:</strong> ${t.dari}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Ke Dana:</strong> ${t.keOleh}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Ke Lokasi:</strong> ${t.ke}</p>`;
    }
    if (t.keterangan) detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Keterangan:</strong> ${t.keterangan}</p>`;

    document.getElementById('modal-body').innerHTML = detailsHtml;
    const modalImage = document.getElementById('modal-image');
    if (t.foto) {
        modalImage.src = t.foto;
        modalImage.parentElement.classList.remove('hidden');
    } else {
        modalImage.src = '';
        modalImage.parentElement.classList.add('hidden');
    }
    document.getElementById('detail-modal').classList.remove('hidden');
    feather.replace();
}

function showBalanceBreakdown() {
    const balanceBreakdownList = document.getElementById('balance-breakdown-list');
    const locations = {};

    transactions.slice().reverse().forEach(t => {
        const initLocation = (loc) => {
            if (!locations[loc]) {
                locations[loc] = { suami: 0, istri: 0, total: 0 };
            }
        };

        if (t.type === 'pemasukan' && t.disimpanDi) {
            const loc = t.disimpanDi.trim();
            initLocation(loc);
            const owner = t.oleh.toLowerCase();
            locations[loc][owner] += t.jumlah;
            locations[loc].total += t.jumlah;
        } else if (t.type === 'pengeluaran' && t.dariLokasi) {
            const loc = t.dariLokasi.trim();
            initLocation(loc);
            const owner = t.oleh.toLowerCase();
            locations[loc][owner] -= t.jumlah;
            locations[loc].total -= t.jumlah;
        } else if (t.type === 'transfer') {
            const fromLoc = t.dari.trim();
            const toLoc = t.ke.trim();
            initLocation(fromLoc);
            initLocation(toLoc);

            const fromOwner = t.dariOleh.toLowerCase();
            const toOwner = t.keOleh.toLowerCase();

            locations[fromLoc].total -= t.jumlah;
            locations[toLoc].total += t.jumlah;

            locations[fromLoc][fromOwner] -= t.jumlah;
            locations[toLoc][toOwner] += t.jumlah;
        }
    });

    const hasData = Object.values(locations).some(loc => loc.total > 0.01);

    if (!hasData) {
        balanceBreakdownList.innerHTML = `<p class="text-gray-500 text-center py-4">Belum ada dana yang tersimpan di lokasi tertentu.</p>`;
    } else {
        balanceBreakdownList.innerHTML = Object.entries(locations)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([location, data]) => {
                if (data.total <= 0.01) return '';

                let subItems = '';
                if (data.suami !== 0) subItems += `<div class="flex justify-between"><span>Dana Suami:</span><span>${formatRupiah(data.suami)}</span></div>`;
                if (data.istri !== 0) subItems += `<div class="flex justify-between"><span>Dana Istri:</span><span>${formatRupiah(data.istri)}</span></div>`;

                return `
                    <div class="p-3 bg-gray-50 rounded-lg">
                        <div class="flex justify-between items-center text-sm mb-2">
                            <span class="font-medium text-gray-700">${location}</span>
                            <span class="font-bold text-gray-900">${formatRupiah(data.total)}</span>
                        </div>
                        ${ subItems ? `<div class="pl-4 border-l-2 border-gray-200 space-y-1 text-xs text-gray-600">${subItems}</div>` : '' }
                    </div>
                `;
            }).join('');
    }
    document.getElementById('balance-breakdown-modal').classList.remove('hidden');
    feather.replace();
}

function handlePageClick(page) {
    reportCurrentPage = page;
    renderLaporan();
}

function renderPaginationControls(totalPages, totalItems) {
    const container = document.getElementById('pagination-container');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    let paginationHtml = `<button id="prev-page-btn" class="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" ${reportCurrentPage === 1 ? 'disabled' : ''}><i data-feather="chevron-left" class="w-5 h-5"></i></button>`;
    paginationHtml += `<span class="text-sm text-gray-600 font-medium">Halaman ${reportCurrentPage} dari ${totalPages}</span>`;
    paginationHtml += `<button id="next-page-btn" class="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" ${reportCurrentPage === totalPages ? 'disabled' : ''}><i data-feather="chevron-right" class="w-5 h-5"></i></button>`;
    container.innerHTML = paginationHtml;
    feather.replace();

    document.getElementById('prev-page-btn').addEventListener('click', () => handlePageClick(reportCurrentPage - 1));
    document.getElementById('next-page-btn').addEventListener('click', () => handlePageClick(reportCurrentPage + 1));
}

function generateXLSX() {
    showPopup({ title: 'Mempersiapkan Excel...', message: 'Mohon tunggu, laporan sedang dibuat.', icon: 'loading' });
    try {
        const bulanSelect = document.getElementById('laporan-bulan');
        const tahunSelect = document.getElementById('laporan-tahun');
        const bulan = bulanSelect.options[bulanSelect.selectedIndex].text;
        const tahun = tahunSelect.value;
        const filtered = transactions.filter(t => t.tanggal.getMonth() == bulanSelect.value && t.tanggal.getFullYear() == tahun);

        const dataToExport = filtered.sort((a, b) => a.tanggal - b.tanggal).map(t => {
            const base = {
                "Tanggal Transaksi": t.tanggal.toLocaleDateString('id-ID'),
                "Waktu Input": t.createdAt ? t.createdAt.toLocaleString('id-ID') : '',
                Tipe: t.type,
                Jumlah: t.jumlah,
                Keterangan: t.keterangan || '',
            };
            if (t.type === 'pemasukan') {
                return { ...base, Oleh: t.oleh, "Disimpan Di": t.disimpanDi };
            } else if (t.type === 'pengeluaran') {
                return { ...base, Oleh: t.oleh, "Dari Lokasi": t.dariLokasi, Kategori: t.kategori };
            } else { // transfer
                return { ...base, "Dari Dana": t.dariOleh, "Dari Lokasi": t.dari, "Ke Dana": t.keOleh, "Ke Lokasi": t.ke };
            }
        });

        if (dataToExport.length === 0) {
            showPopup({ title: 'Gagal', message: 'Tidak ada data untuk diekspor.', icon: 'error', buttons: [{ text: 'Tutup' }] });
            return;
        }

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
}


// --- INITIALIZATION ---
function initializeApp() {
    feather.replace();
    setupModalListeners();
    resetInputForms();

    const onLogin = (user) => {
        currentUser = user;
        if (unsubscribeFromFirestore) unsubscribeFromFirestore();
        unsubscribeFromFirestore = listenToTransactions(user.uid, (data) => {
            transactions = data;
            renderAll();
        });
        initializeUI();
    };

    const onLogout = () => {
        currentUser = null;
        if (unsubscribeFromFirestore) unsubscribeFromFirestore();
        transactions = [];
        renderAll();
    };

    setupAuthListeners(onLogin, onLogout);

    document.getElementById('logout-btn').addEventListener('click', showLogoutConfirmation);
    document.getElementById('logout-btn-mobile').addEventListener('click', showLogoutConfirmation);
    document.getElementById('form-pemasukan').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-pengeluaran').addEventListener('submit', handleFormSubmit);
    document.getElementById('form-transfer').addEventListener('submit', handleFormSubmit);
    document.getElementById('challenge-complete-btn').addEventListener('click', completeChallenge);
    document.getElementById('saldo-card').addEventListener('click', showBalanceBreakdown);

    document.getElementById('laporan-tabel').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const row = e.target.closest('tr[data-transaction-id]');

        if (editBtn || deleteBtn) {
            e.stopPropagation();
            if (editBtn) handleEditTransaction(editBtn.dataset.id);
            if (deleteBtn) handleDeleteTransaction(deleteBtn.dataset.id);
        } else if (row) {
            showTransactionDetails(row.dataset.transactionId);
        }
    });
    
    document.getElementById('recent-transactions-list').addEventListener('click', (e) => {
        const item = e.target.closest('[data-transaction-id]');
        if (item) showTransactionDetails(item.dataset.transactionId);
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
    
    document.getElementById('sort-by-created-at-btn').addEventListener('click', () => {
        reportSortBy = 'createdAt';
        document.getElementById('report-sort-modal').classList.add('hidden');
        renderLaporan();
    });
    document.getElementById('sort-by-tanggal-btn').addEventListener('click', () => {
        reportSortBy = 'tanggal';
        document.getElementById('report-sort-modal').classList.add('hidden');
        renderLaporan();
    });
    
    document.getElementById('chart-prev-btn').addEventListener('click', () => { chartState.offset++; renderChart(); });
    document.getElementById('chart-next-btn').addEventListener('click', () => { chartState.offset = Math.max(0, chartState.offset - 1); renderChart(); });
}

function initializeUI() {
    showPage('beranda');
    switchForm('pemasukan');
    
    const bulanSelect = document.getElementById('laporan-bulan');
    const tahunSelect = document.getElementById('laporan-tahun');

    if (bulanSelect.options.length > 1) return;
    ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].forEach((n, i) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = n;
        bulanSelect.appendChild(o);
    });
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 5; i--) {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = i;
        tahunSelect.appendChild(o);
    }
    bulanSelect.value = new Date().getMonth();
    tahunSelect.value = currentYear;

    const renderTrigger = () => {
        reportCurrentPage = 1;
        renderLaporan();
    };
    bulanSelect.addEventListener('change', renderTrigger);
    tahunSelect.addEventListener('change', renderTrigger);
}

// Expose functions to global window object for inline HTML event handlers
window.app = {
    showPage,
    switchForm,
    generateXLSX
};

// Start the app
initializeApp();

