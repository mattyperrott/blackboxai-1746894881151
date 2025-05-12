import { 
    generateRoomId, 
    generateUsername, 
    validateFileContent, 
    getFileIcon, 
    formatFileSize 
} from './utils.js';
import {
    initializeCrypto,
    generatePreKeyBundle,
    seal,
    sealFile,
    open,
    openFile,
    cleanup
} from './cryptoBridge.js';
import { SecurityConfig, RateLimiter, generateCSRFToken } from './config/security.js';
import logger from './services/logger.js';
import sessionManager from './services/session.js';

class App {
    constructor() {
        // Core components
        this.notifications = window.notifications;
        this.uiState = window.uiState;
        this.settings = window.settings;
        this.messages = window.messages;
        this.sessionManager = sessionManager;
        
        // State
        this.roomId = null;
        this.username = null;
        this.isConnected = false;
        this.cryptoInitialized = false;
        this.csrfToken = null;

        // Rate limiters
        this.messageRateLimiter = new RateLimiter(SecurityConfig.rateLimit.messages);
        this.fileRateLimiter = new RateLimiter(SecurityConfig.rateLimit.files);
    }

    async initialize() {
        try {
            this.csrfToken = generateCSRFToken();
            await this.sessionManager.initialize();
            await this.initializeApp();
            this.setupEventListeners();
            this.setupThemeHandler();
            this.setupTransportToggle();
        } catch (error) {
            logger.error('App Initialization', 'Failed to initialize app', { error });
            this.notifications.error('Failed to initialize app: ' + error.message);
        }
    }

    async initializeApp() {
        // Generate identities
        this.roomId = generateRoomId();
        this.username = generateUsername();

        // Create session for user
        await this.sessionManager.createSession(this.username, this.roomId);
        
        // Update UI with room information
        const roomBanner = document.getElementById('room-banner');
        roomBanner.classList.remove('hidden');
        document.getElementById('room-id').textContent = this.roomId;
        
        try {
            // Show loading state
            this.uiState.startLoading('crypto-init');
            
            // Generate pre-key bundle for initial key exchange
            const preKeyBundle = await generatePreKeyBundle();
            
            // Initialize crypto system
            await initializeCrypto(preKeyBundle.publicKey);
            this.cryptoInitialized = true;
            
            // Initialize connection with backend
            AndroidBridge.join(this.roomId, JSON.stringify(preKeyBundle));
            this.uiState.updateConnectionState('connecting');
            
            // Start session timer
            this.uiState.startSessionTimer();
            
            this.notifications.success('Room initialized successfully');
        } catch (error) {
            this.notifications.error('Failed to initialize crypto: ' + error.message);
            logger.error('Crypto Initialization', error);
        } finally {
            this.uiState.stopLoading('crypto-init');
        }
    }

    setupEventListeners() {
        // Listen for settings changes
        window.addEventListener('settings-changed', (event) => {
            this.handleSettingsChange(event.detail);
        });

        // Listen for connection status changes
        document.getElementById('disconnect-btn').addEventListener('click', () => {
            this.handleDisconnect();
        });

        // Listen for security panel toggle
        document.getElementById('expand-status').addEventListener('click', () => {
            this.uiState.toggleSecurityPanel();
        });
    }

    setupThemeHandler() {
        const darkMode = localStorage.getItem('darkMode') === 'true';
        if (darkMode) {
            document.body.setAttribute('data-theme', 'dark');
        }
    }

    setupTransportToggle() {
        const transportSwitch = document.getElementById('transport-switch');
        if (transportSwitch) {
            transportSwitch.addEventListener('change', (e) => {
                const mode = e.target.value;
                AndroidBridge.setTransport(mode === 'yggdrasil');
                this.uiState.updateConnectionState('connecting');
                this.notifications.info(`Switching transport mode to ${mode}`);
            });
        }
    }

    handleSettingsChange(settings) {
        if (settings.screenshotPrevention) {
            document.body.classList.add('prevent-screenshots');
        } else {
            document.body.classList.remove('prevent-screenshots');
        }
    }

    async handleDisconnect() {
        await this.uiState.withLoading(async () => {
            await cleanup();
            this.uiState.updateConnectionState(false);
            this.notifications.info('Disconnected from room');
        }, 'disconnect');
    }
}

// Initialize app when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.initialize();
});

// Backend message handler
window._onBackendMessage = async (env) => {
    if (!window.app.cryptoInitialized) return;
    
    try {
        const envelope = typeof env === 'string' ? JSON.parse(env) : env;
        if (envelope.type === 'file') {
            const fileMessage = await openFile(envelope);
            window.messages.addMessage(fileMessage, false);
        } else {
            const plain = await open(envelope);
            window.messages.addMessage({ text: plain, timestamp: Date.now() }, false);
        }
    } catch (error) {
        if (error.message.includes('replay')) {
            console.warn('Replay attack prevented:', error);
        } else {
            window.notifications.error('Failed to decrypt message: ' + error.message);
        }
    }
};

// Backend connection status handler
window._onConnectionStatus = (status) => {
    window.app.uiState.updateConnectionState(status);
};

// Backend error handler
window._onBackendError = (error) => {
    window.notifications.error('Backend error: ' + error);
    window.app.uiState.updateConnectionState('disconnected');
};
