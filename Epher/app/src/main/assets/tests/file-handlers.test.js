import { FileUploadManager } from '../js/file-handlers.js';
import { SecurityConfig } from '../js/config/security.js';
import logger from '../js/services/logger.js';

describe('File Upload Manager', () => {
    let fileUploadManager;
    let mockAndroidBridge;

    beforeEach(() => {
        // Mock AndroidBridge
        mockAndroidBridge = {
            sendFileChunk: jest.fn((data, callback) => {
                callback(JSON.stringify({ success: true }));
            }),
            finalizeFileUpload: jest.fn((data, callback) => {
                callback(JSON.stringify({ success: true }));
            })
        };
        global.AndroidBridge = mockAndroidBridge;

        fileUploadManager = new FileUploadManager();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('File Upload', () => {
        const createTestFile = (size = 1024, type = 'text/plain') => {
            return new File([new ArrayBuffer(size)], 'test.txt', { type });
        };

        it('should handle file upload successfully', async () => {
            const file = createTestFile();
            const onProgress = jest.fn();

            const metadata = await fileUploadManager.handleFileUpload(file, onProgress);

            expect(metadata).toHaveProperty('uploadId');
            expect(metadata).toHaveProperty('fileName', 'test.txt');
            expect(metadata).toHaveProperty('fileType', 'text/plain');
            expect(metadata).toHaveProperty('fileSize', 1024);
            expect(metadata).toHaveProperty('totalChunks');
            expect(metadata).toHaveProperty('checksum');
        });

        it('should validate file before upload', async () => {
            const oversizedFile = createTestFile(11 * 1024 * 1024); // 11MB
            const onProgress = jest.fn();

            await expect(fileUploadManager.handleFileUpload(oversizedFile, onProgress))
                .rejects.toThrow(/File size exceeds/);
        });

        it('should upload file in chunks', async () => {
            const file = createTestFile(SecurityConfig.files.chunkSize * 2.5); // 2.5 chunks
            const onProgress = jest.fn();

            await fileUploadManager.handleFileUpload(file, onProgress);

            // Should have called sendFileChunk 3 times (2 full chunks + 1 partial)
            expect(mockAndroidBridge.sendFileChunk).toHaveBeenCalledTimes(3);
        });

        it('should track upload progress', async () => {
            const file = createTestFile(SecurityConfig.files.chunkSize * 2); // 2 chunks
            const onProgress = jest.fn();

            await fileUploadManager.handleFileUpload(file, onProgress);

            expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
                uploaded: 1,
                total: 2,
                percentage: 50
            }));

            expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
                uploaded: 2,
                total: 2,
                percentage: 100
            }));
        });

        it('should handle upload errors with retries', async () => {
            const file = createTestFile();
            const onProgress = jest.fn();

            // Mock failure then success
            let attempts = 0;
            mockAndroidBridge.sendFileChunk.mockImplementation((data, callback) => {
                attempts++;
                if (attempts === 1) {
                    callback(JSON.stringify({ success: false, error: 'Upload failed' }));
                } else {
                    callback(JSON.stringify({ success: true }));
                }
            });

            await fileUploadManager.handleFileUpload(file, onProgress);

            expect(mockAndroidBridge.sendFileChunk).toHaveBeenCalledTimes(2);
            expect(logger.error).toHaveBeenCalledWith(
                'FileUpload',
                'Chunk upload failed',
                expect.any(Object)
            );
        });

        it('should calculate correct checksums', async () => {
            const file = createTestFile();
            const onProgress = jest.fn();

            const metadata = await fileUploadManager.handleFileUpload(file, onProgress);

            expect(metadata.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash
        });
    });

    describe('Upload Management', () => {
        it('should track active uploads', async () => {
            const file = createTestFile();
            const onProgress = jest.fn();

            const metadata = await fileUploadManager.handleFileUpload(file, onProgress);

            expect(fileUploadManager.activeUploads.has(metadata.uploadId)).toBe(true);
        });

        it('should cleanup completed uploads', async () => {
            const file = createTestFile();
            const onProgress = jest.fn();

            const metadata = await fileUploadManager.handleFileUpload(file, onProgress);

            // After successful upload, should be cleaned up
            expect(fileUploadManager.activeUploads.has(metadata.uploadId)).toBe(false);
            expect(fileUploadManager.uploadProgress.has(metadata.uploadId)).toBe(false);
        });

        it('should handle upload cancellation', async () => {
            const file = createTestFile(SecurityConfig.files.chunkSize * 5); // Large file
            const onProgress = jest.fn();

            // Start upload but don't await it
            const uploadPromise = fileUploadManager.handleFileUpload(file, onProgress);
            
            // Get upload ID from active uploads
            const uploadId = Array.from(fileUploadManager.activeUploads.keys())[0];
            
            // Cancel upload
            fileUploadManager.cancelUpload(uploadId);

            expect(fileUploadManager.activeUploads.get(uploadId).status).toBe('cancelled');
        });

        it('should handle upload resumption', async () => {
            const file = createTestFile(SecurityConfig.files.chunkSize * 3);
            const onProgress = jest.fn();

            // Mock a failed upload
            mockAndroidBridge.sendFileChunk.mockImplementationOnce((data, callback) => {
                callback(JSON.stringify({ success: false, error: 'Network error' }));
            });

            try {
                await fileUploadManager.handleFileUpload(file, onProgress);
            } catch (error) {
                // Expected error
            }

            // Get failed upload ID
            const uploadId = Array.from(fileUploadManager.activeUploads.keys())[0];

            // Reset mock
            mockAndroidBridge.sendFileChunk.mockReset();
            mockAndroidBridge.sendFileChunk.mockImplementation((data, callback) => {
                callback(JSON.stringify({ success: true }));
            });

            // Resume upload
            await fileUploadManager.resumeUpload(uploadId);

            expect(mockAndroidBridge.sendFileChunk).toHaveBeenCalled();
            expect(fileUploadManager.activeUploads.get(uploadId).status).toBe('completed');
        });
    });

    describe('Error Handling', () => {
        it('should handle network errors', async () => {
            const file = createTestFile();
            const onProgress = jest.fn();

            mockAndroidBridge.sendFileChunk.mockImplementation(() => {
                throw new Error('Network error');
            });

            await expect(fileUploadManager.handleFileUpload(file, onProgress))
                .rejects.toThrow('Network error');
        });

        it('should handle invalid file types', async () => {
            const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
            const onProgress = jest.fn();

            await expect(fileUploadManager.handleFileUpload(file, onProgress))
                .rejects.toThrow('Unsupported file type');
        });

        it('should handle concurrent upload limits', async () => {
            const files = Array.from({ length: 5 }, () => createTestFile());
            const onProgress = jest.fn();

            // Try to upload all files simultaneously
            const uploads = files.map(file => 
                fileUploadManager.handleFileUpload(file, onProgress)
            );

            await Promise.all(uploads);

            // Should have respected concurrent chunk upload limit
            const maxConcurrent = 3; // From implementation
            const chunkCalls = mockAndroidBridge.sendFileChunk.mock.calls;
            const concurrentCalls = new Set(
                chunkCalls.map(call => JSON.parse(call[0]).uploadId)
            ).size;

            expect(concurrentCalls).toBeLessThanOrEqual(maxConcurrent);
        });
    });
});
