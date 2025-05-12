export const SecurityConfig = {
    // CSRF Protection
    csrf: {
        headerName: 'X-CSRF-Token',
        cookieName: 'csrf-token',
        tokenLength: 32
    },

    // Rate Limiting
    rateLimit: {
        messages: {
            windowMs: 60000, // 1 minute
            maxRequests: 30  // 30 messages per minute
        },
        files: {
            windowMs: 300000, // 5 minutes
            maxRequests: 10   // 10 file uploads per 5 minutes
        }
    },

    // File Validation
    files: {
        maxSize: 10 * 1024 * 1024, // 10MB
        chunkSize: 1024 * 1024,     // 1MB chunks
        allowedTypes: {
            'image/jpeg': {
                maxSize: 5 * 1024 * 1024,
                validateContent: true,
                magicNumbers: ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffe2']
            },
            'image/png': {
                maxSize: 5 * 1024 * 1024,
                validateContent: true,
                magicNumbers: ['89504e47']
            },
            'image/gif': {
                maxSize: 5 * 1024 * 1024,
                validateContent: true,
                magicNumbers: ['47494638']
            },
            'application/pdf': {
                maxSize: 10 * 1024 * 1024,
                validateContent: true,
                magicNumbers: ['25504446']
            },
            'text/plain': {
                maxSize: 1 * 1024 * 1024,
                validateContent: true,
                encoding: 'utf-8'
            }
        }
    },

    // Session Management
    session: {
        timeout: 30 * 60 * 1000,    // 30 minutes
        renewThreshold: 5 * 60 * 1000, // Renew if less than 5 minutes left
        maxAge: 24 * 60 * 60 * 1000  // 24 hours max
    },

    // Message Security
    messages: {
        maxLength: 1000,
        expiration: 24 * 60 * 60 * 1000, // 24 hours
        encryption: {
            algorithm: 'XChaCha20-Poly1305',
            keyRotationInterval: 1000 * 60 * 60, // 1 hour
            backupCount: 3
        }
    },

    // Network Security
    network: {
        connectionTimeout: 30000,    // 30 seconds
        reconnectAttempts: 3,
        reconnectDelay: 5000,        // 5 seconds
        keepAliveInterval: 25000,    // 25 seconds
        bandwidthLimit: 1024 * 1024  // 1MB/s
    },

    // Logging
    logging: {
        level: 'info',
        maxSize: 5 * 1024 * 1024,    // 5MB
        maxFiles: 5,
        sensitiveFields: ['password', 'token', 'key']
    },

    // Access Control
    accessControl: {
        maxGroupSize: 10,
        maxRooms: 5,
        permissions: {
            DELETE_MESSAGE: 'delete_message',
            EDIT_MESSAGE: 'edit_message',
            UPLOAD_FILE: 'upload_file',
            CREATE_GROUP: 'create_group'
        }
    }
};

// CSRF Token Generation
export function generateCSRFToken() {
    const array = new Uint8Array(SecurityConfig.csrf.tokenLength);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Rate Limiting Implementation
export class RateLimiter {
    constructor(config) {
        this.windowMs = config.windowMs;
        this.maxRequests = config.maxRequests;
        this.requests = new Map();
    }

    isAllowed(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        
        // Clean old requests
        const validRequests = userRequests.filter(time => now - time < this.windowMs);
        
        if (validRequests.length >= this.maxRequests) {
            return false;
        }
        
        validRequests.push(now);
        this.requests.set(userId, validRequests);
        return true;
    }

    getRemainingRequests(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        const validRequests = userRequests.filter(time => now - time < this.windowMs);
        return Math.max(0, this.maxRequests - validRequests.length);
    }
}

// File Validation
export async function validateFileContent(file) {
    const config = SecurityConfig.files.allowedTypes[file.type];
    if (!config) {
        throw new Error('Unsupported file type');
    }

    if (file.size > config.maxSize) {
        throw new Error(`File size exceeds limit for type ${file.type}`);
    }

    if (config.validateContent) {
        const header = await readFileHeader(file);
        if (config.magicNumbers && !config.magicNumbers.some(magic => header.startsWith(magic))) {
            throw new Error('Invalid file content');
        }
    }

    return true;
}

async function readFileHeader(file) {
    const chunk = await file.slice(0, 8).arrayBuffer();
    return Array.from(new Uint8Array(chunk))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
