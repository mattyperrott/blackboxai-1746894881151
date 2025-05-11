class UIStateManager {
    constructor() {
        this.loadingIndicator = document.getElementById('loading-indicator');
        this.notifications = window.notifications;
        this.activeStates = new Set();
    }

    /**
     * Show loading state with optional message
     * @param {string} state - Identifier for this loading state
     */
    startLoading(state) {
        this.activeStates.add(state);
        this.loadingIndicator.classList.remove('hidden');
    }

    /**
     * Hide loading state
     * @param {string} state - Identifier for this loading state
     */
    stopLoading(state) {
        this.activeStates.delete(state);
        if (this.activeStates.size === 0) {
            this.loadingIndicator.classList.add('hidden');
        }
    }

    /**
     * Show loading state during async operation
     * @param {Promise} promise - Promise to wait for
     * @param {string} state - Identifier for this loading state
     * @returns {Promise} - Original promise
     */
    async withLoading(promise, state) {
        try {
            this.startLoading(state);
            return await promise;
        } finally {
            this.stopLoading(state);
        }
    }

    /**
     * Update room connection state
     * @param {boolean} isConnected - Whether room is connected
     */
    updateConnectionState(isConnected) {
        const connectionStatus = document.getElementById('connection-status');
        if (isConnected) {
            connectionStatus.label = 'Connected';
            connectionStatus.icon = 'check_circle';
            document.querySelector('.room-actions').classList.remove('hidden');
        } else {
            connectionStatus.label = 'Disconnected';
            connectionStatus.icon = 'error';
            document.querySelector('.room-actions').classList.add('hidden');
        }
    }

    /**
     * Update crypto verification state
     * @param {boolean} isVerified - Whether crypto is verified
     */
    updateCryptoState(isVerified) {
        const cryptoStatus = document.getElementById('crypto-status');
        if (isVerified) {
            cryptoStatus.label = 'Verified';
            cryptoStatus.icon = 'verified_user';
        } else {
            cryptoStatus.label = 'Unverified';
            cryptoStatus.icon = 'security';
        }
    }

    /**
     * Toggle security panel visibility
     */
    toggleSecurityPanel() {
        const securityPanel = document.getElementById('security-panel');
        const expandButton = document.getElementById('expand-status');
        
        if (securityPanel.classList.contains('hidden')) {
            securityPanel.classList.remove('hidden');
            expandButton.icon = 'expand_more';
        } else {
            securityPanel.classList.add('hidden');
            expandButton.icon = 'expand_less';
        }
    }

    /**
     * Update session timer display
     * @param {number} seconds - Session duration in seconds
     */
    updateSessionTimer(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        const timer = document.getElementById('session-timer');
        timer.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize UI state manager when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.uiState = new UIStateManager();
});

// Example usage:
// uiState.startLoading('connecting');
// uiState.updateConnectionState(true);
// uiState.updateCryptoState(true);
// uiState.updateSessionTimer(3600);
// await uiState.withLoading(someAsyncOperation(), 'operation');
