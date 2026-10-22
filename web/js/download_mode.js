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
        localStorage.setItem('hg_drama_dl_mode', _selectedDownloadMode);
        const cb = _pendingDownloadModeCallback;
        closeDownloadModeModal();
        if (typeof cb === 'function') {
            cb(_selectedDownloadMode);
        }
    }

    /**
     * Smart prompt:
     * Executes download with active user mode (default: merged full video)
     */
    function promptDownloadMode({ title, episodeCount = 1, onConfirm }) {
        const active = getActiveDownloadMode() || 'merged';
        if (typeof onConfirm === 'function') {
            return onConfirm(active);
        }
    }

    function getActiveDownloadMode() {
        return 'separate';
    }

    function setQuickDownloadMode(mode) {
        localStorage.setItem('hg_drama_dl_mode', 'separate');
        _selectedDownloadMode = 'separate';
    }

    function updateModeChipsUI(mode) {
        // Removed UI chips
    }

    /**
     * Mode selector bars permanently removed as requested:
     * Short drama series always download clean separate episodes directly.
     */
    function syncSeriesModeBar(episodeCount = 1) {
        const hgBar = document.getElementById('hgDownloadModeBar');
        if (hgBar) hgBar.style.display = 'none';
        const hsBar = document.getElementById('hsDownloadModeBar');
        if (hsBar) hsBar.style.display = 'none';
        const mvBar = document.getElementById('mvDownloadModeBar');
        if (mvBar) mvBar.style.display = 'none';
        const bpBar = document.getElementById('bpDownloadModeBar');
        if (bpBar) bpBar.style.display = 'none';
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

