export function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const currentPageEl = document.getElementById(pageId + '-page');
    if (currentPageEl) {
        currentPageEl.classList.remove('hidden');
    }

    const setActive = (btns, attribute) => {
        btns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = Array.from(btns).find(btn => btn.getAttribute(attribute) === `window.app.showPage('${pageId}')`);
        if (activeBtn) activeBtn.classList.add('active');
    }
    setActive(document.querySelectorAll('.nav-btn'), 'onclick');
    setActive(document.querySelectorAll('.bottom-nav-btn'), 'onclick');
    
    const reportSortModal = document.getElementById('report-sort-modal');
    if (pageId === 'laporan' && !document.querySelector('#laporan-tabel tr')) {
       reportSortModal.classList.remove('hidden');
    } else {
       reportSortModal.classList.add('hidden');
    }

    // Reset form if navigating away from input page without editing
    const isEditing = document.getElementById('pemasukan-submit-btn').firstElementChild.textContent.includes('Perbarui');
    if (pageId !== 'input' && !isEditing) {
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

export const formatRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

export function showPopup(config) {
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
    if (config.buttons && config.buttons.length > 0) {
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
}

export function hidePopup() {
    document.getElementById('popup-modal').classList.add('hidden');
}

export function setupModalListeners() {
    const detailModal = document.getElementById('detail-modal');
    document.getElementById('close-modal-btn').addEventListener('click', () => detailModal.classList.add('hidden'));
    detailModal.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.classList.add('hidden'); });
    
    const balanceModal = document.getElementById('balance-breakdown-modal');
    document.getElementById('close-balance-modal-btn').addEventListener('click', () => balanceModal.classList.add('hidden'));
    balanceModal.addEventListener('click', (e) => { if (e.target === balanceModal) balanceModal.classList.add('hidden'); });
    
     document.getElementById('close-sort-modal-btn').addEventListener('click', () => {
        document.getElementById('report-sort-modal').classList.add('hidden');
    });
}

export function resetInputForms() {
    ['form-pemasukan', 'form-pengeluaran', 'form-transfer'].forEach(id => document.getElementById(id).reset());
    ['pemasukan-preview', 'pengeluaran-preview'].forEach(id => {
        const preview = document.getElementById(id);
        preview.src = "";
        preview.classList.add('hidden');
    });
    document.getElementById('pemasukan-submit-btn').firstElementChild.textContent = "Simpan Pemasukan";
    document.getElementById('pengeluaran-submit-btn').textContent = "Simpan Pengeluaran";
    document.getElementById('transfer-submit-btn').textContent = "Simpan Transfer";
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pemasukan-tanggal').value = today;
    document.getElementById('pengeluaran-tanggal').value = today;
    document.getElementById('transfer-tanggal').value = today;
}

export function showConfetti() {
    const confettiContainer = document.createElement('div');
    confettiContainer.style.position = 'fixed';
    confettiContainer.style.top = '0';
    confettiContainer.style.left = '0';
    confettiContainer.style.width = '100vw';
    confettiContainer.style.height = '100vh';
    confettiContainer.style.pointerEvents = 'none';
    confettiContainer.style.zIndex = '9999';
    document.body.appendChild(confettiContainer);

    const colors = ['#fde047', '#f472b6', '#34d399', '#6366f1'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = `${Math.random() * 100}vw`;
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = `${Math.random() * 2}s`;
        confettiContainer.appendChild(confetti);
    }

    setTimeout(() => {
        confettiContainer.remove();
    }, 3000);
}

