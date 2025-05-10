import { 
    generateRoomId, 
    generateUsername, 
    validateMessage,
    validateFile,
    formatFileSize,
    checkBrowserSupport,
    debounce,
    safeJsonParse,
    copyToClipboard,
    getFileIcon
} from '../js/utils.js';

describe('Utils', () => {
    describe('generateRoomId', () => {
        it('should generate a room ID with correct format', () => {
            const roomId = generateRoomId();
            expect(roomId).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        });

        it('should generate unique room IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(generateRoomId());
            }
            expect(ids.size).toBe(100);
        });
    });

    describe('generateUsername', () => {
        it('should generate a username with adjective and noun', () => {
            const username = generateUsername();
            expect(username).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
        });

        it('should generate unique usernames', () => {
            const usernames = new Set();
            for (let i = 0; i < 100; i++) {
                usernames.add(generateUsername());
            }
            expect(usernames.size).toBeGreaterThan(50); // Allow some collisions
        });
    });

    describe('validateMessage', () => {
        it('should validate correct messages', () => {
            const result = validateMessage('Hello, world!');
            expect(result.valid).toBe(true);
        });

        it('should reject empty messages', () => {
            const result = validateMessage('');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Message cannot be empty');
        });

        it('should reject too long messages', () => {
            const longMessage = 'a'.repeat(1001);
            const result = validateMessage(longMessage);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Message too long (max 1000 characters)');
        });

        it('should reject whitespace-only messages', () => {
            const result = validateMessage('   \n\t   ');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Message cannot be only whitespace');
        });
    });

    describe('validateFile', () => {
        it('should validate allowed file types', () => {
            const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
            expect(() => validateFile(file)).not.toThrow();
        });

        it('should reject files that are too large', () => {
            const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
            expect(() => validateFile(largeFile)).toThrow('File size exceeds 10MB limit');
        });

        it('should reject unsupported file types', () => {
            const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
            expect(() => validateFile(file)).toThrow('File type not supported');
        });
    });

    describe('formatFileSize', () => {
        it('should format bytes correctly', () => {
            expect(formatFileSize(0)).toBe('0 Bytes');
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(1024 * 1024)).toBe('1 MB');
            expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
        });

        it('should format partial units correctly', () => {
            expect(formatFileSize(1536)).toBe('1.5 KB');
            expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
        });
    });

    describe('checkBrowserSupport', () => {
        it('should check for required features', () => {
            const support = checkBrowserSupport();
            expect(support).toHaveProperty('supported');
            expect(support).toHaveProperty('missing');
            expect(Array.isArray(support.missing)).toBe(true);
        });
    });

    describe('debounce', () => {
        jest.useFakeTimers();

        it('should debounce function calls', () => {
            const callback = jest.fn();
            const debounced = debounce(callback, 100);

            debounced();
            debounced();
            debounced();

            expect(callback).not.toBeCalled();

            jest.runAllTimers();

            expect(callback).toBeCalledTimes(1);
        });

        it('should pass arguments to the debounced function', () => {
            const callback = jest.fn();
            const debounced = debounce(callback, 100);

            debounced('test', 123);
            jest.runAllTimers();

            expect(callback).toBeCalledWith('test', 123);
        });
    });

    describe('safeJsonParse', () => {
        it('should parse valid JSON', () => {
            const { data, error } = safeJsonParse('{"test": 123}');
            expect(data).toEqual({ test: 123 });
            expect(error).toBeNull();
        });

        it('should handle invalid JSON', () => {
            const { data, error } = safeJsonParse('invalid json');
            expect(data).toBeNull();
            expect(error).toBeTruthy();
        });
    });

    describe('getFileIcon', () => {
        it('should return correct icon for image files', () => {
            expect(getFileIcon('image/jpeg')).toBe('fa-image');
            expect(getFileIcon('image/png')).toBe('fa-image');
        });

        it('should return correct icon for video files', () => {
            expect(getFileIcon('video/mp4')).toBe('fa-video');
        });

        it('should return correct icon for PDF files', () => {
            expect(getFileIcon('application/pdf')).toBe('fa-file-pdf');
        });

        it('should return default icon for unknown types', () => {
            expect(getFileIcon('unknown/type')).toBe('fa-file');
        });
    });
});
