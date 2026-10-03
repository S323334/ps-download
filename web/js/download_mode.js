/**
 * Smart Drama Download Mode Selector & Auto-Concatenation Controller.
 * Supports strictly 2 options as requested:
 * 1. "បញ្ចូលរឿង" (Merged Full Video) - Always 100% merged!
 * 2. "ភាគ" (Separate Episodes)
 */

(function() {
    let _pendingDownloadModeCallback = null;
    let _selectedDownloadMode = 'merged';

    function selectDownloadModeCard(mode) {
        const cleanMode = (mode === 'separate') ? 'separate' : 'merged';
        _selectedDownloadMode = cleanMode;
        const cards = document.querySelectorAll('.dl-mode-card');
        cards.forEach(c => c.classList.remove('active'));

        if (cleanMode === 'merged') {
            const el = document.getElementById('dlModeCardMerged');
            if (el) el.classList.add('active');
        } else if (cleanMode === 'separate') {
            const el = document.getElementById('dlModeCardSeparate');
            if (el) el.classList.add('active');
        }
    }

    function openDownloadModeModal({ title = '', episodeCount = 1, onConfirm }) {
        _pendingDownloadModeCallback = onConfirm;

        // Restore saved preference if any, default to 'merged'
        let saved = localStorage.getItem('hg_drama_dl_mode') || 'merged';
        if (saved !== 'separate') saved = 'merged';
        selectDownloadModeCard(saved);

        const subEl = document.getElementById('dlModeModalSub');
        if (subEl) {
            const countStr = episodeCount > 0 ? `${episodeCount} ភាគ` : 'ច្រើនភាគ';
            subEl.innerText = `${title ? `«${title}» • ` : ''}${countStr} (Multi-Episodes)`;
        }

        const modal = document.getElementById('downloadModeModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.style.opacity = '1';
            modal.classList.add('active');
        }
    }

    function closeDownloadModeModal() {
        const modal = document.getElementById('downloadModeModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
        _pendingDownloadModeCallback = null;
    }

    function confirmDownloadModeSelection() {
        const chk = document.getElementById('chkRememberDlMode');
        if (chk && chk.checked) {
            localStorage.setItem('hg_drama_dl_mode', _selectedDownloadMode);
        }
        const cb = _pendingDownloadModeCallback;
        closeDownloadModeModal();
        if (typeof cb === 'function') {
            cb(_selectedDownloadMode);
        }
    }

    /**
     * Smart prompt:
     * - If single video (<= 1 ep), execute directly without dialog
     * - If multi-episode drama (> 1 ep), prompt user or use active mode
     */
    function promptDownloadMode({ title, episodeCount = 1, onConfirm }) {
        if (!episodeCount || episodeCount <= 1) {
            return onConfirm('separate');
        }
        const active = getActiveDownloadMode() || 'merged';
        if (typeof onConfirm === 'function') {
            return onConfirm(active);
        }
        openDownloadModeModal({ title, episodeCount, onConfirm });
    }

    function getActiveDownloadMode() {
        const m = localStorage.getItem('hg_drama_dl_mode');
        return (m === 'separate') ? 'separate' : 'merged';
    }

    function setQuickDownloadMode(mode) {
        const cleanMode = (mode === 'separate') ? 'separate' : 'merged';
        localStorage.setItem('hg_drama_dl_mode', cleanMode);
        _selectedDownloadMode = cleanMode;
        updateModeChipsUI(cleanMode);
        if (typeof showToast === 'function') {
            const label = cleanMode === 'merged' ? '🎞️ បញ្ចូលរឿងជាវីដេអូពេញ (Merged Full Video)' : '📁 រាយភាគដាច់ដោយឡែក (Separate Episodes)';
            showToast(`បានជ្រើសរើសទម្រង់៖ ${label}`, '⚙️');
        }
    }

    function updateModeChipsUI(mode) {
        const curMode = (mode || getActiveDownloadMode()).toLowerCase();
        ['Merged', 'Separate'].forEach(m => {
            const isAct = curMode === m.toLowerCase();
            const hgChip = document.getElementById(`chipMode${m}`);
            if (hgChip) hgChip.classList.toggle('active', isAct);
            const hsChip = document.getElementById(`hsChipMode${m}`);
            if (hsChip) hsChip.classList.toggle('active', isAct);
            const mvChip = document.getElementById(`mvChipMode${m}`);
            if (mvChip) mvChip.classList.toggle('active', isAct);
        });
    }

    /**
     * Shows the download mode selector bar ONLY if the item is a multi-episode series (> 1 episode).
     * If single video or 1 episode, hides the mode selector bar completely!
     */
    function syncSeriesModeBar(episodeCount = 1) {
        const isSeries = episodeCount > 1;
        const hgBar = document.getElementById('hgDownloadModeBar');
        if (hgBar) hgBar.style.display = isSeries ? 'flex' : 'none';
        const hsBar = document.getElementById('hsDownloadModeBar');
        if (hsBar) hsBar.style.display = isSeries ? 'flex' : 'none';
        const mvBar = document.getElementById('mvDownloadModeBar');
        if (mvBar) mvBar.style.display = isSeries ? 'flex' : 'none';
        if (isSeries) {
            updateModeChipsUI();
        }
    }

    window.promptDownloadMode = promptDownloadMode;
    window.openDownloadModeModal = openDownloadModeModal;
    window.closeDownloadModeModal = closeDownloadModeModal;
    window.selectDownloadModeCard = selectDownloadModeCard;
    window.confirmDownloadModeSelection = confirmDownloadModeSelection;
    window.getActiveDownloadMode = getActiveDownloadMode;
    window.setQuickDownloadMode = setQuickDownloadMode;
    window.updateModeChipsUI = updateModeChipsUI;
    window.syncSeriesModeBar = syncSeriesModeBar;

    // Initialize chips state on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        updateModeChipsUI();
    });
})();

