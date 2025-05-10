/* ------------------------------------------------------------------
   cryptoBridge.js  –  Interface between UI and Crypto Worker
   Handles message lifecycle and crypto worker communication
   --------------------------------------------------------------- */

let worker = null;
let messageQueue = new Map();
let messageCounter = 0;

// Initialize the crypto worker
function initWorker() {
    return new Promise((resolve, reject) => {
        if (worker) {
            resolve();
            return;
        }
        
        worker = new Worker('js/cryptoWorker.js', { type: 'module' });
        
        worker.onmessage = ({ data }) => {
            if (data.type === 'init' && data.status === 'ready') {
                resolve();
                return;
            }

            const { id, res, err } = data;
            const promise = messageQueue.get(id);
            if (promise) {
                messageQueue.delete(id);
                if (err) {
                    promise.reject(new Error(err));
                } else {
                    promise.resolve(res);
                }
            }
        };

        // Handle worker termination
        worker.onerror = (error) => {
            console.error('Crypto worker error:', error);
            reject(error);
            terminateWorker();
        };
    });
}

// Clean termination of worker
function terminateWorker() {
    if (!worker) return;
    
    // Reject all pending operations
    for (const [, promise] of messageQueue) {
        promise.reject(new Error('Worker terminated'));
    }
    messageQueue.clear();
    
    // Cleanup worker
    sendToWorker('cleanup').finally(() => {
        worker.terminate();
        worker = null;
    });
}

// Send message to worker and wait for response
function sendToWorker(op, args = {}) {
    return new Promise((resolve, reject) => {
        if (!worker) {
            reject(new Error('Crypto worker not initialized'));
            return;
        }

        const id = messageCounter++;
        messageQueue.set(id, { resolve, reject });
        worker.postMessage({ id, op, args });
    });
}

// Initialize crypto system with pre-key bundle
export async function initializeCrypto(preKeyBundle) {
    try {
        await initWorker();
        return await sendToWorker('initialize', { preKeyBundle });
    } catch (error) {
        console.error('Failed to initialize crypto:', error);
        throw error;
    }
}

// Generate a new pre-key bundle for initial key exchange
export async function generatePreKeyBundle() {
    try {
        initWorker();
        return await sendToWorker('generatePreKeyBundle');
    } catch (error) {
        console.error('Failed to generate pre-key bundle:', error);
        throw error;
    }
}

// Encrypt and prepare a message for sending
export async function seal(plaintext) {
    try {
        initWorker();
        return await sendToWorker('seal', { plain: plaintext });
    } catch (error) {
        console.error('Failed to seal message:', error);
        throw error;
    }
}

// Decrypt and verify a received message
export async function open(envelope) {
    try {
        initWorker();
        return await sendToWorker('open', { env: envelope });
    } catch (error) {
        console.error('Failed to open message:', error);
        throw error;
    }
}

// Encrypt and prepare a file for sending
export async function sealFile(fileArgs) {
    try {
        initWorker();
        return await sendToWorker('sealFile', fileArgs);
    } catch (error) {
        console.error('Failed to seal file:', error);
        throw error;
    }
}

// Decrypt and verify a received file
export async function openFile(envelope) {
    try {
        initWorker();
        return await sendToWorker('openFile', { env: envelope });
    } catch (error) {
        console.error('Failed to open file:', error);
        throw error;
    }
}

// Clean up crypto resources
export async function cleanup() {
    try {
        if (worker) {
            await sendToWorker('cleanup');
            terminateWorker();
        }
    } catch (error) {
        console.error('Failed to cleanup crypto:', error);
        throw error;
    }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    cleanup();
});

// Handle visibility change to manage worker lifecycle
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        cleanup();
    }
});
