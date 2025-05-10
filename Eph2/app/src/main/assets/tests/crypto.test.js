import {
    initializeCrypto,
    generatePreKeyBundle,
    seal,
    sealFile,
    open,
    openFile,
    cleanup
} from '../js/cryptoBridge.js';

describe('Crypto Operations', () => {
    let mockWorker;
    
    beforeEach(() => {
        // Reset the worker mock before each test
        mockWorker = {
            postMessage: jest.fn(),
            terminate: jest.fn()
        };
        global.Worker = jest.fn(() => mockWorker);
    });

    afterEach(() => {
        cleanup();
    });

    describe('initializeCrypto', () => {
        it('should initialize crypto system with pre-key bundle', async () => {
            const preKeyBundle = new Uint8Array([1, 2, 3, 4]);
            
            // Simulate worker response
            mockWorker.onmessage = ({ data }) => {
                if (data.op === 'initialize') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: { success: true } 
                        } 
                    });
                }
            };

            const result = await initializeCrypto(preKeyBundle);
            expect(result).toEqual({ success: true });
        });

        it('should handle initialization errors', async () => {
            mockWorker.onmessage = ({ data }) => {
                mockWorker.onmessage({ 
                    data: { 
                        id: data.id, 
                        err: 'Initialization failed' 
                    } 
                });
            };

            await expect(initializeCrypto(new Uint8Array([]))).rejects
                .toThrow('Initialization failed');
        });
    });

    describe('generatePreKeyBundle', () => {
        it('should generate valid pre-key bundle', async () => {
            mockWorker.onmessage = ({ data }) => {
                if (data.op === 'generatePreKeyBundle') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: {
                                publicKey: new Uint8Array([1, 2, 3]),
                                privateKey: new Uint8Array([4, 5, 6])
                            }
                        } 
                    });
                }
            };

            const bundle = await generatePreKeyBundle();
            expect(bundle).toHaveProperty('publicKey');
            expect(bundle).toHaveProperty('privateKey');
            expect(bundle.publicKey).toBeInstanceOf(Uint8Array);
            expect(bundle.privateKey).toBeInstanceOf(Uint8Array);
        });
    });

    describe('Message Encryption/Decryption', () => {
        const testMessage = { text: 'Hello, World!', timestamp: Date.now() };

        it('should encrypt and decrypt messages', async () => {
            mockWorker.onmessage = ({ data }) => {
                if (data.op === 'seal') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: { 
                                nonce: [1, 2, 3],
                                cipher: [4, 5, 6],
                                sig: [7, 8, 9]
                            }
                        } 
                    });
                } else if (data.op === 'open') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: testMessage
                        } 
                    });
                }
            };

            const encrypted = await seal(testMessage);
            expect(encrypted).toHaveProperty('nonce');
            expect(encrypted).toHaveProperty('cipher');
            expect(encrypted).toHaveProperty('sig');

            const decrypted = await open(encrypted);
            expect(decrypted).toEqual(testMessage);
        });

        it('should handle encryption errors', async () => {
            mockWorker.onmessage = ({ data }) => {
                mockWorker.onmessage({ 
                    data: { 
                        id: data.id, 
                        err: 'Encryption failed' 
                    } 
                });
            };

            await expect(seal(testMessage)).rejects
                .toThrow('Encryption failed');
        });
    });

    describe('File Encryption/Decryption', () => {
        const testFile = {
            fileData: 'base64data',
            fileName: 'test.txt',
            fileType: 'text/plain',
            fileSize: 1024
        };

        it('should encrypt and decrypt files', async () => {
            mockWorker.onmessage = ({ data }) => {
                if (data.op === 'sealFile') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: {
                                type: 'file',
                                nonce: [1, 2, 3],
                                cipher: [4, 5, 6],
                                sig: [7, 8, 9]
                            }
                        } 
                    });
                } else if (data.op === 'openFile') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: testFile
                        } 
                    });
                }
            };

            const encrypted = await sealFile(testFile);
            expect(encrypted.type).toBe('file');
            expect(encrypted).toHaveProperty('nonce');
            expect(encrypted).toHaveProperty('cipher');
            expect(encrypted).toHaveProperty('sig');

            const decrypted = await openFile(encrypted);
            expect(decrypted).toEqual(testFile);
        });

        it('should handle file encryption errors', async () => {
            mockWorker.onmessage = ({ data }) => {
                mockWorker.onmessage({ 
                    data: { 
                        id: data.id, 
                        err: 'File encryption failed' 
                    } 
                });
            };

            await expect(sealFile(testFile)).rejects
                .toThrow('File encryption failed');
        });
    });

    describe('cleanup', () => {
        it('should properly cleanup crypto resources', async () => {
            mockWorker.onmessage = ({ data }) => {
                if (data.op === 'cleanup') {
                    mockWorker.onmessage({ 
                        data: { 
                            id: data.id, 
                            res: { success: true } 
                        } 
                    });
                }
            };

            await cleanup();
            expect(mockWorker.terminate).toHaveBeenCalled();
        });
    });
});
