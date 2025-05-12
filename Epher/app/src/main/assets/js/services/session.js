import { SecurityConfig } from '../config/security.js';
import logger from './logger.js';

class SessionManager {
    constructor() {
        this.currentSession = null;
        this.renewalTimer = null;
        this.permissions = new Set();
    }

    async initialize() {
        try {
            // Try to restore existing session
            const savedSession = localStorage.getItem('session');
            if (savedSession) {
                const session = JSON.parse(savedSession);
                if (this.isSessionValid(session)) {
                    await this.restoreSession(session);
                } else {
                    this.clearSession();
                }
            }

            // Set up session renewal
            this.setupSessionRenewal();

            // Set up visibility change handler
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.pauseSession();
                } else {
                    this.resumeSession();
                }
            });

        } catch (error) {
            logger.error('Session', 'Failed to initialize session manager', { error });
            throw error;
        }
    }

    async createSession(username, roomId) {
        try {
            const session = {
                id: this.generateSessionId(),
                username,
                roomId,
                permissions: this.getDefaultPermissions(),
                createdAt: Date.now(),
                expiresAt: Date.now() + SecurityConfig.session.timeout,
                lastActivity: Date.now()
            };

            // Store session
            this.currentSession = session;
            this.permissions = new Set(session.permissions);
            localStorage.setItem('session', JSON.stringify(session));

            // Set up automatic renewal
            this.setupSessionRenewal();

            logger.info('Session', 'Session created', {
                sessionId: session.id,
                username,
                roomId
            });

            return session;

        } catch (error) {
            logger.error('Session', 'Failed to create session', { error });
            throw error;
        }
    }

    async restoreSession(session) {
        try {
            // Verify session integrity
            if (!this.verifySessionIntegrity(session)) {
                throw new Error('Session integrity check failed');
            }

            // Update session
            session.lastActivity = Date.now();
            this.currentSession = session;
            this.permissions = new Set(session.permissions);

            logger.info('Session', 'Session restored', {
                sessionId: session.id
            });

            return session;

        } catch (error) {
            logger.error('Session', 'Failed to restore session', { error });
            throw error;
        }
    }

    async renewSession() {
        if (!this.currentSession) return;

        try {
            const session = {
                ...this.currentSession,
                expiresAt: Date.now() + SecurityConfig.session.timeout,
                lastActivity: Date.now()
            };

            this.currentSession = session;
            localStorage.setItem('session', JSON.stringify(session));

            logger.info('Session', 'Session renewed', {
                sessionId: session.id
            });

        } catch (error) {
            logger.error('Session', 'Failed to renew session', { error });
            throw error;
        }
    }

    setupSessionRenewal() {
        if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
        }

        this.renewalTimer = setInterval(() => {
            if (this.currentSession) {
                const timeUntilExpiry = this.currentSession.expiresAt - Date.now();
                if (timeUntilExpiry < SecurityConfig.session.renewThreshold) {
                    this.renewSession();
                }
            }
        }, 60000); // Check every minute
    }

    pauseSession() {
        if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
            this.renewalTimer = null;
        }
    }

    resumeSession() {
        if (this.currentSession) {
            this.setupSessionRenewal();
        }
    }

    clearSession() {
        this.currentSession = null;
        this.permissions.clear();
        localStorage.removeItem('session');
        if (this.renewalTimer) {
            clearInterval(this.renewalTimer);
            this.renewalTimer = null;
        }

        logger.info('Session', 'Session cleared');
    }

    isSessionValid(session) {
        return session &&
               session.id &&
               session.expiresAt > Date.now() &&
               this.verifySessionIntegrity(session);
    }

    verifySessionIntegrity(session) {
        // Add additional integrity checks as needed
        return session.id && 
               session.username && 
               session.roomId && 
               Array.isArray(session.permissions);
    }

    generateSessionId() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    getDefaultPermissions() {
        return [
            SecurityConfig.accessControl.permissions.EDIT_MESSAGE,
            SecurityConfig.accessControl.permissions.DELETE_MESSAGE,
            SecurityConfig.accessControl.permissions.UPLOAD_FILE
        ];
    }

    // Permission management
    hasPermission(permission) {
        return this.permissions.has(permission);
    }

    addPermission(permission) {
        if (!this.currentSession) return false;
        
        this.permissions.add(permission);
        this.currentSession.permissions = Array.from(this.permissions);
        localStorage.setItem('session', JSON.stringify(this.currentSession));
        
        return true;
    }

    removePermission(permission) {
        if (!this.currentSession) return false;
        
        this.permissions.delete(permission);
        this.currentSession.permissions = Array.from(this.permissions);
        localStorage.setItem('session', JSON.stringify(this.currentSession));
        
        return true;
    }

    // Activity tracking
    updateLastActivity() {
        if (this.currentSession) {
            this.currentSession.lastActivity = Date.now();
            localStorage.setItem('session', JSON.stringify(this.currentSession));
        }
    }

    getSessionInfo() {
        return this.currentSession ? {
            id: this.currentSession.id,
            username: this.currentSession.username,
            roomId: this.currentSession.roomId,
            permissions: Array.from(this.permissions),
            expiresAt: this.currentSession.expiresAt
        } : null;
    }
}

// Export singleton instance
const sessionManager = new SessionManager();
export default sessionManager;
