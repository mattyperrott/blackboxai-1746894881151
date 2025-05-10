// Generate a random room ID with a more readable format
export function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omitting similar-looking characters
    let result = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate a random username with an adjective and noun
export function generateUsername() {
    const adjectives = [
        'Swift', 'Bright', 'Silent', 'Wise', 'Calm',
        'Noble', 'Brave', 'Kind', 'Quick', 'Sharp'
    ];
    const nouns = [
        'Fox', 'Eagle', 'Wolf', 'Hawk', 'Bear',
        'Lion', 'Tiger', 'Owl', 'Deer', 'Raven'
    ];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}`;
}

// Format timestamp in a user-friendly way
export function formatTimestamp(date) {
    const now = new Date();
    const diff = now - date;
    
    // If less than a minute ago
    if (diff < 60000) {
        return 'Just now';
    }
    
    // If less than an hour ago
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}m ago`;
    }
    
    // If today
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // If this year
    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    
    // Otherwise show full date
    return date.toLocaleDateString();
}

// Debounce function to limit the rate of function calls
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Validate message content
export function validateMessage(text) {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Message cannot be empty' };
    }
    
    if (text.length > 1000) {
        return { valid: false, error: 'Message too long (max 1000 characters)' };
    }
    
    if (text.trim().length === 0) {
        return { valid: false, error: 'Message cannot be only whitespace' };
    }
    
    return { valid: true };
}

// Generate a unique message ID
export function generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Check if the browser supports all required features
export function checkBrowserSupport() {
    const requirements = {
        webCrypto: !!window.crypto && !!window.crypto.subtle,
        webWorker: !!window.Worker,
        localStorage: !!window.localStorage,
        json: !!window.JSON,
        promises: !!window.Promise
    };
    
    const missing = Object.entries(requirements)
        .filter(([, supported]) => !supported)
        .map(([feature]) => feature);
    
    return {
        supported: missing.length === 0,
        missing
    };
}

// Safe JSON parse with error handling
export function safeJsonParse(str) {
    try {
        return { data: JSON.parse(str), error: null };
    } catch (error) {
        return { data: null, error: error.message };
    }
}

// Copy text to clipboard with fallback
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                textArea.remove();
                return true;
            } catch (error) {
                textArea.remove();
                return false;
            }
        }
    } catch (error) {
        return false;
    }
}

// File handling utilities
export function validateFile(file) {
    // Maximum file size (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    
    if (!file) {
        throw new Error('No file selected');
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 10MB limit');
    }

    // Allowed file types
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ];

    if (!allowedTypes.includes(file.type)) {
        throw new Error('File type not supported');
    }

    return true;
}

// Get appropriate Font Awesome icon for file type
export function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) {
        return 'fa-image';
    } else if (fileType.startsWith('video/')) {
        return 'fa-video';
    } else if (fileType.startsWith('audio/')) {
        return 'fa-music';
    } else if (fileType === 'application/pdf') {
        return 'fa-file-pdf';
    } else if (fileType.includes('word')) {
        return 'fa-file-word';
    } else if (fileType === 'text/plain') {
        return 'fa-file-alt';
    }
    return 'fa-file';
}

// Format file size for display
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
