/**
 * Smart Drama Download Mode Selector & Auto-Concatenation Controller.
 * Handles:
 * 1. Smart Auto-Detection:
 *    - Single video (<= 1 episode): downloads immediately without prompt
 *    - Drama (> 1 episode): shows sleek modal for Merged vs Separate vs Both
 * 2. User preference persistence (Remember choice)
 * 3. Modal UI interactivity
 */

(function() {
    let _pendingDownloadModeCallback = null;
    let _selectedDownloadMode = 'merged';

    function selectDownloadModeCard(mode) {
        _selectedDownloadMode = mode;
        const cards = document.querySelectorAll('.dl-mode-card');
        cards.forEach(c => c.classList.remove('active'));

        if (mode === 'merged') {
            const el = document.getElementById('dlModeCardMerged');
            if (el) el.classList.add('active');
        } else if (mode === 'separate') {
            const el = document.getElementById('dlModeCardSeparate');
            if (el) el.classList.add('active');
        } else if (mode === 'both') {
            const el = document.getElementById('dlModeCardBoth');
            if (el) el.classList.add('active');
        }
    }

    function openDownloadModeModal({ title = '', episodeCount = 1, onConfirm }) {
        _pendingDownloadModeCallback = onConfirm;

        // Restore saved preference if any, default to 'merged'
        const saved = localStorage.getItem('hg_drama_dl_mode') || 'merged';
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
     * - If multi-episode drama (> 1 ep), prompt user with 3 options
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
        return localStorage.getItem('hg_drama_dl_mode') || 'merged';
    }

    function setQuickDownloadMode(mode) {
        localStorage.setItem('hg_drama_dl_mode', mode);
        _selectedDownloadMode = mode;
        updateModeChipsUI(mode);
        if (typeof showToast === 'function') {
            const label = mode === 'merged' ? '🎞️ បញ្ចូលគ្នាជាវីដេអូពេញ (Merged Full Video)' : (mode === 'both' ? '🎬 យកទាំងពីរ (Merged + Separate)' : '📁 រាយភាគដាច់ដោយឡែក (Separate Episodes)');
            showToast(`បានជ្រើសរើសទម្រង់៖ ${label}`, '⚙️');
        }
    }

    function updateModeChipsUI(mode) {
        const curMode = (mode || getActiveDownloadMode()).toLowerCase();
        ['Merged', 'Separate', 'Both'].forEach(m => {
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

