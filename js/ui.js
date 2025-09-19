// File ini bertanggung jawab untuk semua hal yang berkaitan dengan tampilan.
// Seperti menampilkan halaman, merender data, menampilkan popup, dll.

let financialChart;
let chartState = { monthsToShow: 6, offset: 0 };
let prevSaldo = 0;

// --- UTILITY FUNCTIONS ---
const formatRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

// --- PAGE & FORM SWITCHING ---
export const showPage = (pageId, transactions, editingTransactionId) => {
    // Kembali ke atas halaman setiap kali pindah halaman
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const currentPageEl = document.getElementById(pageId + '-page');
    if (currentPageEl) {
        currentPageEl.classList.remove('hidden');
    }

    const setActive = (btns) => {
        btns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = Array.from(btns).find(btn => btn.dataset.page === pageId);
        if(activeBtn) activeBtn.classList.add('active');
    };
    setActive(document.querySelectorAll('.nav-btn'));
    setActive(document.querySelectorAll('.bottom-nav-btn'));

    if (pageId === 'laporan') {
        document.getElementById('report-sort-modal').classList.remove('hidden');
    } else {
        document.getElementById('report-sort-modal').classList.add('hidden');
    }
    
    if (pageId === 'input' && editingTransactionId) {
        handleEditTransaction(editingTransactionId, transactions);
    } else if (pageId !== 'input') {
        resetInputForms();
    }
};

const switchForm = (formType) => {
    ['pemasukan', 'pengeluaran', 'transfer'].forEach(type => {
        document.getElementById(`form-${type}`).classList.toggle('hidden', type !== formType);
        const tab = document.getElementById(`${type}-tab`);
        tab.classList.toggle('active', type === formType);
        tab.classList.toggle('text-gray-500', type !== formType);
    });
};

// --- POPUP & MODAL ---
export const showPopup = (config) => {
    const popupModal = document.getElementById('popup-modal');
    document.getElementById('popup-title').textContent = config.title;
    document.getElementById('popup-message').textContent = config.message;

    document.getElementById('popup-loader').classList.toggle('hidden', config.icon !== 'loading');
    const popupIcon = document.getElementById('popup-icon');
    popupIcon.innerHTML = '';
    if (config.icon === 'success') popupIcon.innerHTML = `<i data-feather="check-circle" class="w-12 h-12 text-green-500"></i>`;
    if (config.icon === 'error') popupIcon.innerHTML = `<i data-feather="x-circle" class="w-12 h-12 text-red-500"></i>`;
    
    const popupBtnContainer = document.getElementById('popup-button-container');
    popupBtnContainer.innerHTML = '';
    if (config.buttons?.length > 0) {
        config.buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.textContent = btnInfo.text;
            button.className = `w-full font-bold py-2 px-4 rounded-lg transition-all duration-300 ${btnInfo.class || 'bg-indigo-600 hover:bg-indigo-700 text-white'}`;
            button.onclick = () => {
                hidePopup();
                if (btnInfo.action) btnInfo.action();
            };
            popupBtnContainer.appendChild(button);
        });
    }

    popupModal.classList.remove('hidden');
    feather.replace();
};

export const hidePopup = () => document.getElementById('popup-modal').classList.add('hidden');

// --- RENDER FUNCTIONS ---
const renderDashboard = (transactions) => {
    const totalPemasukan = transactions.filter(t => t.type === 'pemasukan').reduce((s, t) => s + t.jumlah, 0);
    const totalPengeluaran = transactions.filter(t => t.type === 'pengeluaran').reduce((s, t) => s + t.jumlah, 0);
    const currentSaldo = totalPemasukan - totalPengeluaran;
    document.getElementById('total-pemasukan').textContent = formatRupiah(totalPemasukan);
    document.getElementById('total-pengeluaran').textContent = formatRupiah(totalPengeluaran);
    document.getElementById('saldo-saat-ini').textContent = formatRupiah(currentSaldo);

    const motivationalMessageEl = document.getElementById('motivational-message');
    if (currentSaldo > 0 && currentSaldo > prevSaldo) {
        motivationalMessageEl.textContent = "Kerja bagus! Keuanganmu dalam kondisi baik. Pertahankan!";
        motivationalMessageEl.className = 'text-center font-medium text-green-600';
    } else if (currentSaldo < 0) {
        motivationalMessageEl.textContent = "Tetap semangat! Mari kita perbaiki pengeluaran bulan ini.";
        motivationalMessageEl.className = 'text-center font-medium text-red-600';
    } else {
        motivationalMessageEl.textContent = "Keuanganmu seimbang. Mari mulai menabung bulan ini!";
        motivationalMessageEl.className = 'text-center font-medium text-gray-700';
    }
    prevSaldo = currentSaldo;

    setDailyChallenge();
    renderConsistencyTracker(transactions);
    renderRecentTransactions(transactions);
};

const renderChart = (transactions) => {
    const ctx = document.getElementById('financialChart').getContext('2d');
    const allMonths = [...new Set(transactions.map(t => `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}`))].sort();
    const endIndex = allMonths.length - (chartState.offset * chartState.monthsToShow);
    const startIndex = Math.max(0, endIndex - chartState.monthsToShow);
    const visibleMonths = allMonths.slice(startIndex, endIndex);
    const labels = visibleMonths.map(m => new Date(m + '-02').toLocaleString('id-ID', { month: 'short', year: 'numeric' }));
    const incomeData = visibleMonths.map(m => transactions.filter(t => t.type === 'pemasukan' && `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}` === m).reduce((s, t) => s + t.jumlah, 0));
    const expenseData = visibleMonths.map(m => transactions.filter(t => t.type === 'pengeluaran' && `${t.tanggal.getFullYear()}-${String(t.tanggal.getMonth() + 1).padStart(2, '0')}` === m).reduce((s, t) => s + t.jumlah, 0));
    
    if (financialChart) financialChart.destroy();
    
    financialChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Pemasukan', data: incomeData, backgroundColor: '#81e6d9' }, { label: 'Pengeluaran', data: expenseData, backgroundColor: '#fecaca' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => v >= 1e6 ? `Rp ${v / 1e6}jt` : (v >= 1e3 ? `Rp ${v / 1e3}rb` : `Rp ${v}`) } } },
            plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatRupiah(c.parsed.y)}` } } }
        }
    });
    document.getElementById('chart-next-btn').disabled = chartState.offset === 0;
    document.getElementById('chart-prev-btn').disabled = startIndex === 0;
};

const renderLaporan = (transactions, currentPage, itemsPerPage, sortBy) => {
    const bulan = document.getElementById('laporan-bulan').value;
    const tahun = document.getElementById('laporan-tahun').value;

    let filtered = transactions.filter(t => t.tanggal.getMonth() == bulan && t.tanggal.getFullYear() == tahun);

    filtered.sort((a, b) => {
        const dateA = sortBy === 'createdAt' ? a.createdAt || a.tanggal : a.tanggal;
        const dateB = sortBy === 'createdAt' ? b.createdAt || b.tanggal : b.tanggal;
        return dateB - dateA;
    });

    const p = filtered.filter(t => t.type === 'pemasukan').reduce((s, t) => s + t.jumlah, 0);
    const pg = filtered.filter(t => t.type === 'pengeluaran').reduce((s, t) => s + t.jumlah, 0);
    document.getElementById('laporan-pemasukan').textContent = formatRupiah(p);
    document.getElementById('laporan-pengeluaran').textContent = formatRupiah(pg);
    document.getElementById('laporan-selisih').textContent = formatRupiah(p - pg);

    const tabelBody = document.getElementById('laporan-tabel');
    tabelBody.innerHTML = '';
    
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (paginatedItems.length === 0) {
        tabelBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">Tidak ada data untuk periode ini.</td></tr>`;
        renderPaginationControls(0, 0);
        return;
    }

    paginatedItems.forEach(t => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-200/80 hover:bg-gray-50 cursor-pointer';
        row.setAttribute('data-transaction-id', t.id);

        const time = t.createdAt ? t.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
        const tanggal = `<span>${t.tanggal.toLocaleDateString('id-ID')}</span><small class="text-gray-400 block">${time}</small>`;
        let keterangan, tipe, jumlah;

        if (t.type === 'transfer') {
            keterangan = `<span>Transfer: <b>${t.dari}</b> → <b>${t.ke}</b></span><small class="text-gray-500">${t.keterangan || ''}</small>`;
            tipe = `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Transfer</span>`;
            jumlah = formatRupiah(t.jumlah);
        } else {
            const isIncome = t.type === 'pemasukan';
            let detailSumber = isIncome ? `Disimpan di: ${t.disimpanDi}` : `Dari: ${t.dariLokasi || '?'}`;
            keterangan = `<span>${t.keterangan}</span><small class="text-gray-500">${detailSumber} (${t.oleh})</small>`;
            tipe = `<span class="px-2 py-1 rounded-full text-xs font-semibold ${isIncome ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${t.type}</span>`;
            jumlah = formatRupiah(t.jumlah);
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
    renderPaginationControls(totalPages, currentPage);
};

const renderPaginationControls = (totalPages, currentPage) => {
    const container = document.getElementById('pagination-container');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    let paginationHtml = `<button id="prev-page-btn" class="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}><i data-feather="chevron-left" class="w-5 h-5 pointer-events-none"></i></button>`;
    paginationHtml += `<span class="text-sm text-gray-600 font-medium">Halaman ${currentPage} dari ${totalPages}</span>`;
    paginationHtml += `<button id="next-page-btn" class="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}><i data-feather="chevron-right" class="w-5 h-5 pointer-events-none"></i></button>`;
    
    container.innerHTML = paginationHtml;
    feather.replace();
};

const renderRecentTransactions = (transactions) => {
    const recentList = document.getElementById('recent-transactions-list');
    recentList.innerHTML = '';
    const sortedForRecent = transactions.slice().sort((a, b) => (b.createdAt || b.tanggal) - (a.createdAt || b.tanggal));

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
        } else {
            iconHtml = `<div class="p-2 rounded-full bg-blue-100"><i data-feather="repeat" class="w-5 h-5 text-blue-600"></i></div>`;
            textHtml = `<p class="font-semibold text-gray-800">Transfer Dana</p><p class="text-xs text-gray-500">${t.dari} → ${t.ke}</p>`;
            amountHtml = `<p class="font-bold text-blue-600">${formatRupiah(t.jumlah)}</p>`;
        }
        item.innerHTML = `<div class="flex items-center space-x-3 pointer-events-none">${iconHtml}<div>${textHtml}</div></div>${amountHtml}`;
        recentList.appendChild(item);
    });
    feather.replace();
};

const renderConsistencyTracker = (transactions) => {
    const consistencyTrackerEl = document.getElementById('consistency-tracker');
    consistencyTrackerEl.innerHTML = '';
    const daysData = {};
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(new Date().getDate() - i);
        daysData[date.toISOString().split('T')[0]] = false;
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
        dayDiv.innerHTML = `<span class="text-xs font-medium">${dayName}</span><span class="text-xs ${hasEntry ? 'text-indigo-800' : 'text-gray-500'}">${hasEntry ? '✓' : '—'}</span>`;
        consistencyTrackerEl.appendChild(dayDiv);
    });
};

const setDailyChallenge = () => {
    const challengeList = ["Catat semua pengeluaran kecilmu hari ini!", "Tinjau kembali pengeluaran terbesar Anda minggu lalu.", "Identifikasi satu pengeluaran yang tidak perlu hari ini.", "Tulis satu tujuan keuangan kecil untuk minggu ini.", "Lakukan pencatatan keuangan dua kali hari ini!", ];
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
    challengeCompleteBtn.style.display = challengeCompletedToday ? 'none' : 'inline-block';
    if(challengeCompletedToday) challengeMessageEl.textContent += " (Selesai!)";
    
    const count = parseInt(localStorage.getItem('completedChallenges') || '0', 10);
    challengeCountEl.textContent = `Anda telah menyelesaikan ${count} tantangan.`;
};

// --- INITIALIZATION ---
export const initializeUI = (user) => {
    feather.replace();
    showPage('beranda');
    switchForm('pemasukan');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pemasukan-tanggal').value = today;
    document.getElementById('pengeluaran-tanggal').value = today;
    document.getElementById('transfer-tanggal').value = today;
    
    const userName = user.displayName || user.email;
    document.getElementById('user-name').textContent = userName;
    if (userName) document.getElementById('user-initial').textContent = userName.charAt(0).toUpperCase();

    setupLaporanFilters();
    initUIEventListeners();
};

const setupLaporanFilters = () => {
    const bulanSelect = document.getElementById('laporan-bulan');
    const tahunSelect = document.getElementById('laporan-tahun');
    if (bulanSelect.options.length > 1) return;
    ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"].forEach((n, i) => {
        const o = document.createElement('option'); o.value = i; o.textContent = n; bulanSelect.appendChild(o);
    });
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 5; i--) {
        const o = document.createElement('option'); o.value = i; o.textContent = i; tahunSelect.appendChild(o);
    }
    bulanSelect.value = new Date().getMonth();
    tahunSelect.value = currentYear;
};

// --- COMBINED RENDER ---
export const renderAll = (transactions, currentPage, itemsPerPage, sortBy) => {
    renderDashboard(transactions);
    renderChart(transactions);
    if (!document.getElementById('laporan-page').classList.contains('hidden')) {
        renderLaporan(transactions, currentPage, itemsPerPage, sortBy);
    }
};

// --- UI EVENT LISTENERS ---
const initUIEventListeners = () => {
    document.querySelectorAll('.input-tab').forEach(tab => tab.addEventListener('click', () => switchForm(tab.dataset.form)));
    ['pemasukan-foto', 'pengeluaran-foto'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
            const preview = document.getElementById(id.replace('foto', 'preview'));
            if (e.target.files?.[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => { preview.src = ev.target.result; preview.classList.remove('hidden'); }
                reader.readAsDataURL(e.target.files[0]);
            } else {
                preview.classList.add('hidden');
            }
        });
    });

    const detailModal = document.getElementById('detail-modal');
    document.getElementById('close-modal-btn').addEventListener('click', () => detailModal.classList.add('hidden'));
    detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.classList.add('hidden'); });
    
    document.getElementById('recent-transactions-list').addEventListener('click', (e) => {
        const item = e.target.closest('[data-transaction-id]');
        if (item) showTransactionDetails(item.dataset.transactionId, transactions);
    });

    document.getElementById('chart-prev-btn').addEventListener('click', () => { chartState.offset++; renderChart(transactions); });
    document.getElementById('chart-next-btn').addEventListener('click', () => { chartState.offset = Math.max(0, chartState.offset - 1); renderChart(transactions); });
    
    document.getElementById('challenge-complete-btn').addEventListener('click', () => {
        localStorage.setItem('challengeCompletedToday', 'true');
        let count = parseInt(localStorage.getItem('completedChallenges') || '0', 10) + 1;
        localStorage.setItem('completedChallenges', count);
        setDailyChallenge();
        showPopup({ title: 'Tantangan Selesai!', message: 'Anda berhasil menyelesaikan tantangan hari ini. Hebat!', icon: 'success', buttons: [{ text: 'OK' }] });
    });
    
    document.getElementById('close-sort-modal-btn').addEventListener('click', () => document.getElementById('report-sort-modal').classList.add('hidden'));
};

export const resetInputForms = () => {
    ['form-pemasukan', 'form-pengeluaran', 'form-transfer'].forEach(id => document.getElementById(id).reset());
    ['pemasukan-preview', 'pengeluaran-preview'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById('pemasukan-submit-btn').firstElementChild.textContent = "Simpan Pemasukan";
    document.getElementById('pengeluaran-submit-btn').textContent = "Simpan Pengeluaran";
    document.getElementById('transfer-submit-btn').textContent = "Simpan Transfer";
};

export const showTransactionDetails = (transactionId, transactions) => {
    const t = transactions.find(tr => tr.id == transactionId); if (!t) return;
    const modal = document.getElementById('detail-modal');
    document.getElementById('modal-title').textContent = t.type === 'transfer' ? `Transfer Dana` : t.keterangan;
    
    let detailsHtml = `<p><strong class="font-medium text-gray-500 w-28 inline-block">Jumlah:</strong> <span class="font-bold ${t.type === 'pemasukan' ? 'text-green-600' : t.type === 'pengeluaran' ? 'text-red-600' : 'text-blue-600'}">${formatRupiah(t.jumlah)}</span></p>
                     <p><strong class="font-medium text-gray-500 w-28 inline-block">Tanggal:</strong> ${t.tanggal.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>`;
    
    if (t.createdAt) detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Waktu Input:</strong> ${t.createdAt.toLocaleString('id-ID')}</p>`;
    if (t.type === 'pemasukan') {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Oleh:</strong> ${t.oleh}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Disimpan di:</strong> ${t.disimpanDi}</p>`;
    } else if (t.type === 'pengeluaran') {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari Dana:</strong> ${t.oleh}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari Lokasi:</strong> ${t.dariLokasi}</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Kategori:</strong> ${t.kategori}</p>`;
    } else if (t.type === 'transfer') {
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Dari:</strong> ${t.dariOleh} (${t.dari})</p>`;
        detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Ke:</strong> ${t.keOleh} (${t.ke})</p>`;
    }
    if(t.keterangan) detailsHtml += `<p><strong class="font-medium text-gray-500 w-28 inline-block">Keterangan:</strong> ${t.keterangan}</p>`;

    document.getElementById('modal-body').innerHTML = detailsHtml;
    const modalImage = document.getElementById('modal-image');
    if (t.foto) { modalImage.src = t.foto; modalImage.parentElement.classList.remove('hidden'); }
    else { modalImage.src = ''; modalImage.parentElement.classList.add('hidden'); }
    modal.classList.remove('hidden');
    feather.replace();
};

const handleEditTransaction = (transactionId, transactions) => {
    const t = transactions.find(tr => tr.id === transactionId); if (!t) return;
    
    switchForm(t.type);
    const form = document.getElementById(`form-${t.type}`);
    form.querySelector('[type=date]').value = new Date(t.tanggal.getTime() - (t.tanggal.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
    form.querySelector('[type=number]').value = t.jumlah;
    form.querySelector('input[id*="-keterangan"]').value = t.keterangan || '';
    
    if (t.type === 'pemasukan' || t.type === 'pengeluaran') {
        form.querySelector('select[id*="-oleh"]').value = t.oleh;
        const preview = document.getElementById(`${t.type}-preview`);
        if (t.foto) { preview.src = t.foto; preview.classList.remove('hidden'); }
        else { preview.classList.add('hidden'); }
        
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
};

