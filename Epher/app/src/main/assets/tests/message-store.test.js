import MessageStore from '../js/services/message-store.js';
import logger from '../js/services/logger.js';
import { SecurityConfig } from '../js/config/security.js';

describe('Message Store', () => {
    let messageStore;

    beforeEach(async () => {
        // Clear IndexedDB
        indexedDB = new FDBFactory();
        messageStore = new MessageStore();
        await messageStore.initialize();
    });

    afterEach(() => {
        messageStore = null;
    });

    describe('Initialization', () => {
        it('should initialize database successfully', () => {
            expect(messageStore.isInitialized).toBe(true);
            expect(messageStore.db).toBeTruthy();
        });

        it('should create required object stores', async () => {
            const db = messageStore.db;
            expect(db.objectStoreNames.contains('messages')).toBe(true);
            expect(db.objectStoreNames.contains('pending')).toBe(true);
        });

        it('should handle initialization errors', async () => {
            // Mock IndexedDB error
            const errorStore = new MessageStore();
            indexedDB.open = jest.fn().mockImplementation(() => {
                throw new Error('DB initialization failed');
            });

            await expect(errorStore.initialize()).rejects.toThrow();
        });
    });

    describe('Message Operations', () => {
        const testMessage = {
            id: 'msg-1',
            roomId: 'room-1',
            sender: 'user1',
            content: 'Test message',
            timestamp: Date.now(),
            type: 'text'
        };

        it('should save message successfully', async () => {
            await messageStore.saveMessage(testMessage);
            
            // Verify message is in cache
            expect(messageStore.messageCache.get(testMessage.id)).toEqual(testMessage);
            
            // Verify message is in database
            const transaction = messageStore.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const request = store.get(testMessage.id);
            
            const result = await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result);
            });
            
            expect(result).toEqual(testMessage);
        });

        it('should handle message save errors', async () => {
            const invalidMessage = { ...testMessage, id: null };
            await expect(messageStore.saveMessage(invalidMessage)).rejects.toThrow();
        });

        it('should clean up old messages', async () => {
            // Add old message
            const oldMessage = {
                ...testMessage,
                id: 'old-msg',
                timestamp: Date.now() - (31 * 24 * 60 * 60 * 1000) // 31 days old
            };
            
            await messageStore.saveMessage(oldMessage);
            await messageStore.cleanupOldMessages();
            
            // Verify old message is removed
            const transaction = messageStore.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const request = store.get(oldMessage.id);
            
            const result = await new Promise((resolve) => {
                request.onsuccess = () => resolve(request.result);
            });
            
            expect(result).toBeUndefined();
        });
    });

    describe('Logger Integration', () => {
        it('should log message operations', async () => {
            const logSpy = jest.spyOn(logger, 'info');
            
            const testMessage = {
                id: 'msg-2',
                roomId: 'room-1',
                content: 'Test message',
                timestamp: Date.now()
            };
            
            await messageStore.saveMessage(testMessage);
            
            expect(logSpy).toHaveBeenCalledWith(
                'MessageStore',
                'Message saved',
                expect.objectContaining({
                    messageId: testMessage.id,
                    roomId: testMessage.roomId
                })
            );
        });

        it('should log errors appropriately', async () => {
            const errorSpy = jest.spyOn(logger, 'error');
            
            // Force an error
            const invalidMessage = { id: null };
            try {
                await messageStore.saveMessage(invalidMessage);
            } catch (error) {
                // Expected error
            }
            
            expect(errorSpy).toHaveBeenCalledWith(
                'MessageStore',
                'Failed to save message',
                expect.objectContaining({
                    error: expect.any(Error)
                })
            );
        });
    });

    describe('Message Cache', () => {
        it('should maintain cache consistency', async () => {
            const testMessage = {
                id: 'msg-3',
                content: 'Test cache',
                timestamp: Date.now()
            };
            
            await messageStore.saveMessage(testMessage);
            expect(messageStore.messageCache.get(testMessage.id)).toEqual(testMessage);
            
            // Clear cache
            messageStore.messageCache.clear();
            expect(messageStore.messageCache.size).toBe(0);
        });

        it('should handle cache limits', async () => {
            // Add many messages to test cache limit
            const messages = Array.from({ length: 1000 }, (_, i) => ({
                id: `msg-${i}`,
                content: `Message ${i}`,
                timestamp: Date.now() + i
            }));
            
            for (const message of messages) {
                await messageStore.saveMessage(message);
            }
            
            // Verify cache doesn't exceed reasonable size
            expect(messageStore.messageCache.size).toBeLessThanOrEqual(1000);
        });
    });

    describe('Cleanup Tasks', () => {
        it('should run cleanup tasks periodically', async () => {
            jest.useFakeTimers();
            
            const cleanupSpy = jest.spyOn(messageStore, 'cleanupOldMessages');
            
            // Advance timers
            jest.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours
            
            expect(cleanupSpy).toHaveBeenCalled();
            
            jest.useRealTimers();
        });

        it('should handle cleanup errors gracefully', async () => {
            const errorSpy = jest.spyOn(logger, 'error');
            
            // Mock cleanup error
            messageStore.db.transaction = jest.fn().mockImplementation(() => {
                throw new Error('Cleanup failed');
            });
            
            await messageStore.cleanupOldMessages();
            
            expect(errorSpy).toHaveBeenCalledWith(
                'MessageStore',
                'Failed to cleanup old messages',
                expect.any(Object)
            );
        });
    });
});
