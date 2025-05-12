import logger from './logger.js';
import { SecurityConfig } from '../config/security.js';

class MessageStore {
    constructor() {
        this.db = null;
        this.messageCache = new Map();
        this.pendingMessages = new Set();
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Initialize IndexedDB
            const request = indexedDB.open('MessageStore', 1);

            request.onerror = (event) => {
                logger.error('MessageStore', 'Failed to open database', {
                    error: event.target.error
                });
                throw new Error('Failed to open message store database');
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Messages store
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
                    messageStore.createIndex('roomId', 'roomId');
                    messageStore.createIndex('timestamp', 'timestamp');
                    messageStore.createIndex('sender', 'sender');
                    messageStore.createIndex('type', 'type');
                }

                // Pending messages store
                if (!db.objectStoreNames.contains('pending')) {
                    const pendingStore = db.createObjectStore('pending', { keyPath: 'id' });
                    pendingStore.createIndex('timestamp', 'timestamp');
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                this.startCleanupTask();
                logger.info('MessageStore', 'Database initialized successfully');
            };

        } catch (error) {
            logger.error('MessageStore', 'Initialization failed', { error });
            throw error;
        }
    }

    async saveMessage(message) {
        if (!this.isInitialized) throw new Error('Message store not initialized');

        try {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');

            // Add message to database
            await store.add(message);

            // Update cache
            this.messageCache.set(message.id, message);

            logger.info('MessageStore', 'Message saved', {
                messageId: message.id,
                roomId: message.roomId
            });

            // Cleanup old messages if needed
            await this.cleanupOldMessages();

        } catch (error) {
            logger.error('MessageStore', 'Failed to save message', { error });
            throw error;
        }
    }

    async cleanupOldMessages() {
        // Remove messages older than 30 days
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const transaction = this.db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const index = store.index('timestamp');
        
        const range = IDBKeyRange.upperBound(thirtyDaysAgo);
        await index.openCursor(range).then(function deleteOldMessages(cursor) {
            if (!cursor) return;
            cursor.delete();
            return cursor.continue().then(deleteOldMessages);
        });
    }
}

export default MessageStore;

        