import { NetworkManager } from '../nodejs-project/network.js';
import { SecurityConfig } from '../js/config/security.js';
import logger from '../js/services/logger.js';

describe('Network Manager', () => {
    let networkManager;
    let mockSwarm;

    beforeEach(() => {
        // Mock swarm functionality
        mockSwarm = {
            join: jest.fn(),
            leave: jest.fn(),
            rejoin: jest.fn(),
            on: jest.fn(),
            peers: new Set()
        };

        // Mock crypto for key generation
        global.crypto.subtle = {
            generateKey: jest.fn().mockResolvedValue('mock-key'),
            exportKey: jest.fn().mockResolvedValue(new Uint8Array(32))
        };

        networkManager = new NetworkManager();
        networkManager.swarm = mockSwarm;
    });

    afterEach(() => {
        jest.clearAllMocks();
        if (networkManager.reconnectTimer) {
            clearTimeout(networkManager.reconnectTimer);
        }
    });

    describe('Connection Management', () => {
        it('should handle connection initialization', async () => {
            const roomId = 'TEST-ROOM';
            await networkManager.connect(roomId);

            expect(mockSwarm.join).toHaveBeenCalledWith(roomId);
            expect(networkManager.isConnected).toBe(true);
        });

        it('should implement exponential backoff for reconnection', async () => {
            jest.useFakeTimers();

            // Simulate disconnection
            networkManager.isConnected = false;
            networkManager.reconnectAttempts = 0;

            networkManager.attemptReconnect();

            // First attempt should be after initial delay
            expect(setTimeout).toHaveBeenLastCalledWith(
                expect.any(Function),
                SecurityConfig.network.initialReconnectDelay
            );

            // Simulate first attempt failure
            jest.advanceTimersByTime(SecurityConfig.network.initialReconnectDelay);
            networkManager.attemptReconnect();

            // Second attempt should use exponential backoff
            expect(setTimeout).toHaveBeenLastCalledWith(
                expect.any(Function),
                SecurityConfig.network.initialReconnectDelay * Math.pow(2, 1)
            );

            jest.useRealTimers();
        });

        it('should cap maximum reconnection delay', async () => {
            jest.useFakeTimers();

            // Simulate multiple failed reconnection attempts
            networkManager.isConnected = false;
            networkManager.reconnectAttempts = 10; // High number to exceed max delay

            networkManager.attemptReconnect();

            // Delay should be capped at maxReconnectDelay
            expect(setTimeout).toHaveBeenLastCalledWith(
                expect.any(Function),
                SecurityConfig.network.maxReconnectDelay
            );

            jest.useRealTimers();
        });

        it('should handle clean disconnection', async () => {
            await networkManager.disconnect();

            expect(mockSwarm.leave).toHaveBeenCalled();
            expect(networkManager.isConnected).toBe(false);
            expect(networkManager.pendingMessages.length).toBe(0);
        });
    });

    describe('Message Handling', () => {
        it('should queue messages when offline', async () => {
            networkManager.isConnected = false;
            const message = { type: 'text', content: 'Test message' };

            await networkManager.sendMessage(message);

            expect(networkManager.pendingMessages).toContain(message);
            expect(networkManager.pendingMessages.length).toBeLessThanOrEqual(
                SecurityConfig.network.offlineQueueLimit
            );
        });

        it('should flush pending messages when connection is restored', async () => {
            // Queue some messages
            networkManager.isConnected = false;
            const messages = [
                { type: 'text', content: 'Message 1' },
                { type: 'text', content: 'Message 2' }
            ];

            for (const message of messages) {
                await networkManager.sendMessage(message);
            }

            // Simulate connection restoration
            networkManager.isConnected = true;
            await networkManager.flushPendingMessages();

            expect(networkManager.pendingMessages.length).toBe(0);
        });

        it('should handle message delivery confirmation', async () => {
            const message = { type: 'text', content: 'Test message' };
            networkManager.isConnected = true;

            const deliveryPromise = networkManager.sendMessage(message);
            
            // Simulate successful delivery
            mockSwarm.emit('messageDelivered', { messageId: message.id, success: true });

            const result = await deliveryPromise;
            expect(result.success).toBe(true);
        });

        it('should respect rate limiting', async () => {
            networkManager.isConnected = true;
            const message = { type: 'text', content: 'Test message' };

            // Send messages up to rate limit
            const promises = [];
            for (let i = 0; i < SecurityConfig.rateLimit.messages.maxRequests + 1; i++) {
                promises.push(networkManager.sendMessage({ ...message, id: `msg-${i}` }));
            }

            await expect(Promise.all(promises)).rejects.toThrow(/rate limit/i);
        });
    });

    describe('Error Handling', () => {
        it('should handle peer connection errors', () => {
            const error = new Error('Peer connection failed');
            mockSwarm.emit('error', error);

            expect(logger.error).toHaveBeenCalledWith(
                'Network',
                'Peer connection error',
                expect.objectContaining({ error })
            );
        });

        it('should handle message send timeout', async () => {
            jest.useFakeTimers();
            networkManager.isConnected = true;

            const sendPromise = networkManager.sendMessage({ 
                type: 'text', 
                content: 'Test message' 
            });

            // Advance time past the connection timeout
            jest.advanceTimersByTime(SecurityConfig.network.connectionTimeout + 100);

            await expect(sendPromise).rejects.toThrow(/timeout/i);

            jest.useRealTimers();
        });

        it('should handle swarm errors', () => {
            const errorHandler = jest.fn();
            networkManager.on('error', errorHandler);

            const error = new Error('Swarm error');
            mockSwarm.emit('error', error);

            expect(errorHandler).toHaveBeenCalledWith(error);
        });
    });

    describe('Peer Management', () => {
        it('should track connected peers', () => {
            const peer = { id: 'peer-1' };
            mockSwarm.emit('peer', peer);

            expect(networkManager.peers.has(peer.id)).toBe(true);
        });

        it('should handle peer disconnection', () => {
            const peer = { id: 'peer-1' };
            mockSwarm.emit('peer', peer);
            mockSwarm.emit('peer-disconnected', peer);

            expect(networkManager.peers.has(peer.id)).toBe(false);
        });

        it('should cleanup peer resources on disconnection', () => {
            const peer = { id: 'peer-1' };
            networkManager.peerTimeouts.set(peer.id, setTimeout(() => {}, 1000));

            mockSwarm.emit('peer-disconnected', peer);

            expect(networkManager.peerTimeouts.has(peer.id)).toBe(false);
        });
    });

    describe('Keep-Alive Mechanism', () => {
        it('should send keep-alive messages', () => {
            jest.useFakeTimers();
            networkManager.startKeepAlive();

            jest.advanceTimersByTime(SecurityConfig.network.keepAliveInterval);

            expect(mockSwarm.emit).toHaveBeenCalledWith(
                'message',
                expect.objectContaining({ type: 'keep-alive' })
            );

            jest.useRealTimers();
        });

        it('should handle keep-alive responses', () => {
            const peer = { id: 'peer-1' };
            networkManager.handleKeepAlive(peer);

            expect(networkManager.peerLastSeen.get(peer.id)).toBeDefined();
        });

        it('should detect stale peers', () => {
            jest.useFakeTimers();

            const peer = { id: 'peer-1' };
            networkManager.peers.add(peer.id);
            networkManager.peerLastSeen.set(
                peer.id, 
                Date.now() - SecurityConfig.network.connectionTimeout - 1000
            );

            networkManager.checkStaleConnections();

            expect(networkManager.peers.has(peer.id)).toBe(false);

            jest.useRealTimers();
        });
    });
});
