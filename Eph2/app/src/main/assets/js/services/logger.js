import { SecurityConfig } from '../config/security.js';

class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.listeners = new Set();
        this.sensitiveFields = new Set(SecurityConfig.logging.sensitiveFields);
    }

    // Log levels
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        AUDIT: 4
    };

    // Initialize logger with persistence
    async initialize() {
        try {
            // Set up IndexedDB for log persistence
            const request = indexedDB.open('AppLogs', 1);
            
            request.onerror = (event) => {
                console.error('Failed to initialize logger DB:', event.target.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('logs')) {
                    const store = db.createObjectStore('logs', { keyPath: 'timestamp' });
                    store.createIndex('level', 'level');
                    store.createIndex('category', 'category');
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.pruneOldLogs();
            };
        } catch (error) {
            console.error('Logger initialization failed:', error);
        }
    }

    // Log an event
    log(level, category, message, data = {}) {
        const timestamp = Date.now();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            data: this.sanitizeData(data)
        };

        // Add stack trace for errors
        if (level === Logger.LEVELS.ERROR && data instanceof Error) {
            logEntry.stack = data.stack;
        }

        // Store in memory
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Persist to IndexedDB
        this.persistLog(logEntry);

        // Notify listeners
        this.notifyListeners(logEntry);

        // Console output for development
        if (process.env.NODE_ENV === 'development') {
            this.consoleOutput(logEntry);
        }
    }

    // Sanitize sensitive data
    sanitizeData(data) {
        const sanitized = { ...data };
        for (const key in sanitized) {
            if (this.sensitiveFields.has(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof sanitized[key] === 'object') {
                sanitized[key] = this.sanitizeData(sanitized[key]);
            }
        }
        return sanitized;
    }

    // Persist log to IndexedDB
    async persistLog(logEntry) {
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['logs'], 'readwrite');
            const store = transaction.objectStore('logs');
            await store.add(logEntry);
        } catch (error) {
            console.error('Failed to persist log:', error);
        }
    }

    // Prune old logs
    async pruneOldLogs() {
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['logs'], 'readwrite');
            const store = transaction.objectStore('logs');
            const range = IDBKeyRange.upperBound(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days
            await store.delete(range);
        } catch (error) {
            console.error('Failed to prune old logs:', error);
        }
    }

    // Add listener for real-time log monitoring
    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    // Notify all listeners
    notifyListeners(logEntry) {
        this.listeners.forEach(listener => {
            try {
                listener(logEntry);
            } catch (error) {
                console.error('Logger listener error:', error);
            }
        });
    }

    // Console output formatting
    consoleOutput(logEntry) {
        const timestamp = new Date(logEntry.timestamp).toISOString();
        const level = Object.keys(Logger.LEVELS).find(
            key => Logger.LEVELS[key] === logEntry.level
        );
        
        console.group(`${timestamp} [${level}] ${logEntry.category}`);
        console.log(logEntry.message);
        if (Object.keys(logEntry.data).length > 0) {
            console.log('Data:', logEntry.data);
        }
        if (logEntry.stack) {
            console.log('Stack:', logEntry.stack);
        }
        console.groupEnd();
    }

    // Query logs
    async queryLogs(options = {}) {
        if (!this.db) return [];

        try {
            const transaction = this.db.transaction(['logs'], 'readonly');
            const store = transaction.objectStore('logs');
            
            let range = null;
            if (options.startTime && options.endTime) {
                range = IDBKeyRange.bound(options.startTime, options.endTime);
            } else if (options.startTime) {
                range = IDBKeyRange.lowerBound(options.startTime);
            } else if (options.endTime) {
                range = IDBKeyRange.upperBound(options.endTime);
            }

            const logs = [];
            await new Promise((resolve, reject) => {
                const request = store.openCursor(range);
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (this.matchesFilter(cursor.value, options)) {
                            logs.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });

            return logs;
        } catch (error) {
            console.error('Failed to query logs:', error);
            return [];
        }
    }

    // Check if log entry matches filter
    matchesFilter(logEntry, options) {
        if (options.level && logEntry.level !== options.level) {
            return false;
        }
        if (options.category && logEntry.category !== options.category) {
            return false;
        }
        if (options.search) {
            const searchLower = options.search.toLowerCase();
            return logEntry.message.toLowerCase().includes(searchLower) ||
                   JSON.stringify(logEntry.data).toLowerCase().includes(searchLower);
        }
        return true;
    }

    // Convenience methods for different log levels
    debug(category, message, data) {
        this.log(Logger.LEVELS.DEBUG, category, message, data);
    }

    info(category, message, data) {
        this.log(Logger.LEVELS.INFO, category, message, data);
    }

    warn(category, message, data) {
        this.log(Logger.LEVELS.WARN, category, message, data);
    }

    error(category, message, data) {
        this.log(Logger.LEVELS.ERROR, category, message, data);
    }

    audit(category, message, data) {
        this.log(Logger.LEVELS.AUDIT, category, message, data);
    }
}

// Export singleton instance
const logger = new Logger();
export default logger;
