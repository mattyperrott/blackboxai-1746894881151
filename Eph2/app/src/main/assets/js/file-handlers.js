import { SecurityConfig } from './config/security.js';
import logger from './services/logger.js';
import { validateFileContent, getFileIcon, formatFileSize } from './utils.js';

const CHUNK_SIZE = SecurityConfig.files.chunkSize;

export class FileUploadManager {
    constructor() {
        this.activeUploads = new Map();
        this.uploadProgress = new Map();
    }

    async handleFileUpload(file, onProgress) {
        try {
            // Validate file
            await validateFileContent(file);
            
            // Generate upload ID
            const uploadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Initialize upload metadata
            const metadata = {
                uploadId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                totalChunks: Math.ceil(file.size / CHUNK_SIZE),
                checksum: await this.calculateChecksum(file)
            };
            
            // Store upload state
            this.activeUploads.set(uploadId, {
                file,
                metadata,
                chunksUploaded: new Set(),
                status: 'uploading'
            });
            
            // Start upload
            await this.uploadFileInChunks(uploadId, onProgress);
            
            return metadata;
            
        } catch (error) {
            logger.error('FileUpload', 'File upload failed', { error });
            throw error;
        }
    }

    async uploadFileInChunks(uploadId, onProgress) {
        const upload = this.activeUploads.get(uploadId);
        if (!upload) throw new Error('Upload not found');

        const { file, metadata } = upload;
        const chunks = [];

        try {
            // Split file into chunks
            for (let i = 0; i < metadata.totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                chunks.push({ index: i, data: chunk });
            }

            // Upload chunks in parallel with limit
            const CONCURRENT_CHUNKS = 3;
            for (let i = 0; i < chunks.length; i += CONCURRENT_CHUNKS) {
                const batch = chunks.slice(i, i + CONCURRENT_CHUNKS);
                await Promise.all(batch.map(chunk => this.uploadChunk(uploadId, chunk, onProgress)));
            }

            // Verify upload completion
            if (upload.chunksUploaded.size === metadata.totalChunks) {
                await this.finalizeUpload(uploadId);
            }

        } catch (error) {
            upload.status = 'failed';
            logger.error('FileUpload', 'Chunk upload failed', { 
                uploadId, 
                error 
            });
            throw error;
        }
    }

    async uploadChunk(uploadId, { index, data }, onProgress) {
        const upload = this.activeUploads.get(uploadId);
        if (!upload) throw new Error('Upload not found');

        try {
            // Create chunk metadata
            const chunkMetadata = {
                uploadId,
                index,
                total: upload.metadata.totalChunks,
                checksum: await this.calculateChecksum(data)
            };

            // Convert chunk to base64
            const reader = new FileReader();
            const chunkBase64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(data);
            });

            // Encrypt and send chunk
            const chunkData = {
                metadata: chunkMetadata,
                data: chunkBase64
            };

            const response = await this.sendChunk(chunkData);
            
            if (response.success) {
                upload.chunksUploaded.add(index);
                this.updateProgress(uploadId, onProgress);
            } else {
                throw new Error(response.error || 'Chunk upload failed');
            }

        } catch (error) {
            logger.error('FileUpload', 'Chunk upload failed', { 
                uploadId, 
                chunkIndex: index, 
                error 
            });
            throw error;
        }
    }

    async finalizeUpload(uploadId) {
        const upload = this.activeUploads.get(uploadId);
        if (!upload) throw new Error('Upload not found');

        try {
            // Send finalization request
            const response = await this.sendFinalization(upload.metadata);
            
            if (response.success) {
                upload.status = 'completed';
                logger.info('FileUpload', 'File upload completed', { 
                    uploadId,
                    fileName: upload.metadata.fileName
                });
            } else {
                throw new Error(response.error || 'Upload finalization failed');
            }

        } catch (error) {
            upload.status = 'failed';
            logger.error('FileUpload', 'Upload finalization failed', { 
                uploadId, 
                error 
            });
            throw error;
        } finally {
            // Cleanup
            this.activeUploads.delete(uploadId);
            this.uploadProgress.delete(uploadId);
        }
    }

    updateProgress(uploadId, onProgress) {
        const upload = this.activeUploads.get(uploadId);
        if (!upload) return;

        const progress = {
            uploaded: upload.chunksUploaded.size,
            total: upload.metadata.totalChunks,
            percentage: (upload.chunksUploaded.size / upload.metadata.totalChunks) * 100
        };

        this.uploadProgress.set(uploadId, progress);
        onProgress?.(progress);
    }

    async calculateChecksum(data) {
        const buffer = await data.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async sendChunk(chunkData) {
        // Implement chunk sending logic using AndroidBridge
        return new Promise((resolve, reject) => {
            try {
                AndroidBridge.sendFileChunk(JSON.stringify(chunkData), (response) => {
                    resolve(JSON.parse(response));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async sendFinalization(metadata) {
        // Implement upload finalization logic using AndroidBridge
        return new Promise((resolve, reject) => {
            try {
                AndroidBridge.finalizeFileUpload(JSON.stringify(metadata), (response) => {
                    resolve(JSON.parse(response));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    resumeUpload(uploadId) {
        const upload = this.activeUploads.get(uploadId);
        if (!upload || upload.status !== 'failed') return;

        upload.status = 'uploading';
        return this.uploadFileInChunks(uploadId, 
            progress => this.updateProgress(uploadId, progress)
        );
    }

    cancelUpload(uploadId) {
        const upload = this.activeUploads.get(uploadId);
        if (!upload) return;

        upload.status = 'cancelled';
        this.activeUploads.delete(uploadId);
        this.uploadProgress.delete(uploadId);

        logger.info('FileUpload', 'Upload cancelled', { uploadId });
    }
}

// Export singleton instance
export const fileUploadManager = new FileUploadManager();
