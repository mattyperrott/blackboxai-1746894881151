import sessionManager from '../js/services/session.js';
import { SecurityConfig } from '../js/config/security.js';
import { generateDeviceFingerprint } from '../js/config/security.js';

describe('Session Management', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        // Reset session manager
        sessionManager.clearSession();
    });

    describe('Session Creation', () => {
        it('should create a new session with correct properties', async () => {
            const username = 'testUser';
            const roomId = 'TEST-ROOM';
            
            const session = await sessionManager.createSession(username, roomId);
            
            expect(session).toHaveProperty('id');
            expect(session).toHaveProperty('username', username);
            expect(session).toHaveProperty('roomId', roomId);
            expect(session).toHaveProperty('permissions');
            expect(session).toHaveProperty('createdAt');
            expect(session).toHaveProperty('expiresAt');
            expect(session.expiresAt).toBeGreaterThan(Date.now());
        });

        it('should include device fingerprint when enabled', async () => {
            const username = 'testUser';
            const roomId = 'TEST-ROOM';
            
            const session = await sessionManager.createSession(username, roomId);
            
            if (SecurityConfig.session.deviceFingerprintEnabled) {
                expect(session).toHaveProperty('fingerprint');
                expect(session.fingerprint).toBe(generateDeviceFingerprint());
            }
        });

        it('should store session in localStorage', async () => {
            const username = 'testUser';
            const roomId = 'TEST-ROOM';
            
            await sessionManager.createSession(username, roomId);
            
            const storedSession = localStorage.getItem('session');
            expect(storedSession).toBeTruthy();
            expect(JSON.parse(storedSession)).toHaveProperty('username', username);
        });
    });

    describe('Session Restoration', () => {
        it('should restore a valid session', async () => {
            // Create and store a session
            const originalSession = await sessionManager.createSession('testUser', 'TEST-ROOM');
            
            // Clear current session
            sessionManager.clearSession();
            
            // Attempt to restore
            const restoredSession = await sessionManager.restoreSession(originalSession);
            
            expect(restoredSession).toHaveProperty('id', originalSession.id);
            expect(restoredSession).toHaveProperty('username', originalSession.username);
        });

        it('should reject expired sessions', async () => {
            const expiredSession = {
                id: 'test-id',
                username: 'testUser',
                roomId: 'TEST-ROOM',
                permissions: [],
                createdAt: Date.now() - SecurityConfig.session.timeout * 2,
                expiresAt: Date.now() - SecurityConfig.session.timeout
            };

            await expect(sessionManager.restoreSession(expiredSession))
                .rejects.toThrow('Session integrity check failed');
        });

        it('should reject sessions with invalid fingerprint', async () => {
            if (SecurityConfig.session.deviceFingerprintEnabled) {
                const invalidSession = {
                    id: 'test-id',
                    username: 'testUser',
                    roomId: 'TEST-ROOM',
                    permissions: [],
                    createdAt: Date.now(),
                    expiresAt: Date.now() + SecurityConfig.session.timeout,
                    fingerprint: 'invalid-fingerprint'
                };

                await expect(sessionManager.restoreSession(invalidSession))
                    .rejects.toThrow('Session integrity check failed');
            }
        });
    });

    describe('Session Renewal', () => {
        it('should renew session before expiration', async () => {
            const session = await sessionManager.createSession('testUser', 'TEST-ROOM');
            const originalExpiry = session.expiresAt;
            
            // Fast forward time to near expiration
            jest.advanceTimersByTime(SecurityConfig.session.timeout - SecurityConfig.session.renewThreshold - 1000);
            
            await sessionManager.renewSession();
            
            const renewedSession = sessionManager.getSessionInfo();
            expect(renewedSession.expiresAt).toBeGreaterThan(originalExpiry);
        });

        it('should maintain session integrity during renewal', async () => {
            const originalSession = await sessionManager.createSession('testUser', 'TEST-ROOM');
            
            await sessionManager.renewSession();
            
            const renewedSession = sessionManager.getSessionInfo();
            expect(renewedSession.id).toBe(originalSession.id);
            expect(renewedSession.username).toBe(originalSession.username);
            expect(renewedSession.roomId).toBe(originalSession.roomId);
        });
    });

    describe('Permission Management', () => {
        it('should handle permission checks correctly', async () => {
            await sessionManager.createSession('testUser', 'TEST-ROOM');
            
            const permission = SecurityConfig.accessControl.permissions.UPLOAD_FILE;
            
            expect(sessionManager.hasPermission(permission)).toBe(true);
            
            sessionManager.removePermission(permission);
            expect(sessionManager.hasPermission(permission)).toBe(false);
            
            sessionManager.addPermission(permission);
            expect(sessionManager.hasPermission(permission)).toBe(true);
        });

        it('should persist permission changes', async () => {
            await sessionManager.createSession('testUser', 'TEST-ROOM');
            
            const permission = SecurityConfig.accessControl.permissions.EDIT_MESSAGE;
            sessionManager.removePermission(permission);
            
            // Verify persistence in localStorage
            const storedSession = JSON.parse(localStorage.getItem('session'));
            expect(storedSession.permissions).not.toContain(permission);
        });
    });

    describe('Session Cleanup', () => {
        it('should properly clear session data', () => {
            sessionManager.createSession('testUser', 'TEST-ROOM')
                .then(() => {
                    sessionManager.clearSession();
                    
                    expect(sessionManager.getSessionInfo()).toBeNull();
                    expect(localStorage.getItem('session')).toBeNull();
                });
        });

        it('should handle visibility changes', () => {
            const visibilityChange = new Event('visibilitychange');
            
            // Mock document.hidden
            Object.defineProperty(document, 'hidden', {
                configurable: true,
                get: () => true
            });
            
            document.dispatchEvent(visibilityChange);
            
            // Verify session is paused
            expect(sessionManager.renewalTimer).toBeNull();
        });
    });
});
