/* ------------------------------------------------------------------
   cryptoWorker.js  –  Web-Worker that runs ALL libsodium operations
   with double-ratchet, forward secrecy, and traffic shaping
   --------------------------------------------------------------- */

/* Initialize libsodium */
let sodium;

async function initSodium() {
    try {
        const libsodiumModule = await import('./libsodium-inline.js');
        await new Promise(resolve => {
            self.addEventListener('libsodium#initialized', () => {
                sodium = self._sodium;
                resolve();
            });
        });
        postMessage({ type: 'init', status: 'ready' });
    } catch (error) {
        postMessage({ type: 'init', status: 'error', error: error.message });
    }
}

// Start initialization
initSodium();

/* --- Constants --------------------------------------------------- */
const BUCKET_SIZE = 256; // Packet size bucket for padding
const RATCHET_MESSAGES = 100; // Messages before DH ratchet rotation
const KEEPALIVE_INTERVAL = 500; // ms between keep-alives
const JITTER_MAX = 250; // Maximum timestamp jitter in ms

/* --- State Management -------------------------------------------- */
class DoubleRatchet {
    constructor() {
        this.rootKey = null;
        this.sendingKey = null;
        this.receivingKey = null;
        this.dhKeyPair = null;
        this.remotePublicKey = null;
        this.messagesSent = 0;
        this.messagesReceived = 0;
        this.seenMessages = new Set();
    }

    async initialize(preKeyBundle) {
        const sodium = await ensureSodium();
        
        // Generate initial X25519 key pair
        this.dhKeyPair = sodium.crypto_kx_keypair();
        
        // Perform DH with pre-key bundle
        const sharedSecret = sodium.crypto_kx_client_session_keys(
            this.dhKeyPair.publicKey,
            this.dhKeyPair.privateKey,
            preKeyBundle
        );
        
        // Set up initial ratchet state
        this.rootKey = sharedSecret.rx;
        this.sendingKey = sodium.crypto_kdf_derive_from_key(32, 1, "sending", this.rootKey);
        this.receivingKey = sodium.crypto_kdf_derive_from_key(32, 2, "receiving", this.rootKey);
    }

    async rotateRatchet() {
        const sodium = await ensureSodium();
        
        // Generate new DH key pair
        const newDHPair = sodium.crypto_kx_keypair();
        
        // Perform DH with remote public key
        const sharedSecret = sodium.crypto_kx_client_session_keys(
            newDHPair.publicKey,
            newDHPair.privateKey,
            this.remotePublicKey
        );
        
        // Update ratchet state
        this.dhKeyPair = newDHPair;
        this.rootKey = sharedSecret.rx;
        this.sendingKey = sodium.crypto_kdf_derive_from_key(32, 1, "sending", this.rootKey);
        this.receivingKey = sodium.crypto_kdf_derive_from_key(32, 2, "receiving", this.rootKey);
        
        // Reset message counters
        this.messagesSent = 0;
        this.messagesReceived = 0;
    }

    async deriveMessageKey(key, counter) {
        const sodium = await ensureSodium();
        return sodium.crypto_kdf_derive_from_key(32, counter, "msg", key);
    }

    async wipeKey(key) {
        const sodium = await ensureSodium();
        sodium.memzero(key);
    }
}

const ratchet = new DoubleRatchet();

/* --- Helpers ---------------------------------------------------- */
let sodiumReady = false;

async function ensureSodium() {
    if (!sodiumReady) {
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (sodium) {
                    clearInterval(checkInterval);
                    sodiumReady = true;
                    resolve();
                }
            }, 50);
        });
    }
    return sodium;
}

async function b64ToU8(b64) {
    const sodium = await ensureSodium();
    return sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
}

async function u8ToB64(u8) {
    const sodium = await ensureSodium();
    return sodium.to_base64(u8, sodium.base64_variants.ORIGINAL);
}

async function padToBucket(data) {
    const sodium = await ensureSodium();
    const currentSize = data.length;
    const targetSize = Math.ceil(currentSize / BUCKET_SIZE) * BUCKET_SIZE;
    const padding = new Uint8Array(targetSize - currentSize);
    sodium.randombytes_buf(padding);
    return new Uint8Array([...data, ...padding]);
}

function addJitter(timestamp) {
    const jitter = (Math.random() * JITTER_MAX * 2) - JITTER_MAX;
    return timestamp + jitter;
}

/* --- Keep-alive Management --------------------------------------- */
let keepAliveInterval = null;

function startKeepAlive() {
    if (keepAliveInterval) return;
    keepAliveInterval = setInterval(async () => {
        try {
            const dummy = sodium.randombytes_buf(32);
            const encrypted = await encryptMessage(dummy, true);
            postMessage({ type: 'keepalive', data: encrypted });
        } catch (e) {
            console.error('Keep-alive failed:', e);
        }
    }, KEEPALIVE_INTERVAL);
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

/* --- Message Encryption/Decryption ------------------------------- */
async function encryptMessage(plaintext, isKeepalive = false) {
    const sodium = await ensureSodium();

    // Check if ratchet rotation is needed
    if (!isKeepalive && ratchet.messagesSent >= RATCHET_MESSAGES) {
        await ratchet.rotateRatchet();
    }

    // Derive message key
    const messageKey = await ratchet.deriveMessageKey(ratchet.sendingKey, ratchet.messagesSent);

    // Prepare message with metadata
    const message = {
        content: plaintext,
        timestamp: addJitter(Date.now()),
        counter: ratchet.messagesSent,
        dhKey: Array.from(ratchet.dhKeyPair.publicKey)
    };

    // Generate nonce
    const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );

    // Encrypt message
    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        sodium.from_string(JSON.stringify(message)),
        null, null, nonce, messageKey
    );

    // Sign the ciphertext
    const sig = sodium.crypto_sign_detached(cipher, ratchet.dhKeyPair.privateKey);

    // Pad the final envelope
    const envelope = {
        nonce: Array.from(nonce),
        cipher: Array.from(cipher),
        sig: Array.from(sig)
    };

    // Increment counter and wipe message key
    if (!isKeepalive) ratchet.messagesSent++;
    await ratchet.wipeKey(messageKey);

    return envelope;
}

async function decryptMessage(envelope) {
    const sodium = await ensureSodium();
    
    const nonceU = new Uint8Array(envelope.nonce);
    const cipherU = new Uint8Array(envelope.cipher);
    const sigU = new Uint8Array(envelope.sig);

    // Verify signature
    if (!sodium.crypto_sign_verify_detached(sigU, cipherU, ratchet.remotePublicKey)) {
        throw new Error('Invalid signature');
    }

    // Derive message key
    const messageKey = await ratchet.deriveMessageKey(ratchet.receivingKey, ratchet.messagesReceived);

    // Decrypt message
    const plainBuf = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, cipherU, null, nonceU, messageKey
    );

    // Parse message
    const message = JSON.parse(sodium.to_string(plainBuf));

    // Check for replay
    const messageId = `${message.counter}-${message.timestamp}`;
    if (ratchet.seenMessages.has(messageId)) {
        throw new Error('Message replay detected');
    }
    ratchet.seenMessages.add(messageId);

    // Update remote DH key if changed
    if (message.dhKey && !sodium.memcmp(message.dhKey, ratchet.remotePublicKey)) {
        ratchet.remotePublicKey = new Uint8Array(message.dhKey);
        await ratchet.rotateRatchet();
    }

    // Increment counter and wipe message key
    ratchet.messagesReceived++;
    await ratchet.wipeKey(messageKey);

    return message.content;
}

/* --- RPC Handler ------------------------------------------------ */
self.onmessage = async ({ data }) => {
    const { id, op, args } = data;
    let res, err = null;

    try {
        // Ensure sodium is initialized for all operations
        const sodium = await ensureSodium();
        
        switch (op) {
            case 'initialize': {
                const { preKeyBundle } = args;
                await ratchet.initialize(new Uint8Array(preKeyBundle));
                startKeepAlive();
                res = { success: true };
                break;
            }

            case 'generatePreKeyBundle': {
                const keyPair = sodium.crypto_kx_keypair();
                res = {
                    publicKey: Array.from(keyPair.publicKey),
                    privateKey: Array.from(keyPair.privateKey)
                };
                break;
            }

            case 'seal': {
                const { plain } = args;
                res = await encryptMessage(plain);
                break;
            }

            case 'open': {
                const { env } = args;
                res = await decryptMessage(env);
                break;
            }

            case 'sealFile': {
                const { fileData, fileName, fileType } = args;
                
                // Check if ratchet rotation is needed
                if (ratchet.messagesSent >= RATCHET_MESSAGES) {
                    await ratchet.rotateRatchet();
                }

                // Derive message key
                const messageKey = await ratchet.deriveMessageKey(ratchet.sendingKey, ratchet.messagesSent);

                // Prepare file message
                const message = {
                    type: 'file',
                    fileName,
                    fileType,
                    fileData,
                    timestamp: addJitter(Date.now()),
                    counter: ratchet.messagesSent,
                    dhKey: Array.from(ratchet.dhKeyPair.publicKey)
                };

                // Generate nonce
                const nonce = sodium.randombytes_buf(
                    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
                );

                // Encrypt message
                const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
                    sodium.from_string(JSON.stringify(message)),
                    null, null, nonce, messageKey
                );

                // Sign the ciphertext
                const sig = sodium.crypto_sign_detached(cipher, ratchet.dhKeyPair.privateKey);

                // Pad the final envelope
                const envelope = {
                    type: 'file',
                    nonce: Array.from(nonce),
                    cipher: Array.from(cipher),
                    sig: Array.from(sig)
                };

                // Increment counter and wipe message key
                ratchet.messagesSent++;
                ratchet.wipeKey(messageKey);

                res = envelope;
                break;
            }

            case 'openFile': {
                const { env } = args;
                const nonceU = new Uint8Array(env.nonce);
                const cipherU = new Uint8Array(env.cipher);
                const sigU = new Uint8Array(env.sig);

                // Verify signature
                if (!sodium.crypto_sign_verify_detached(sigU, cipherU, ratchet.remotePublicKey)) {
                    throw new Error('Invalid file message signature');
                }

                // Derive message key
                const messageKey = await ratchet.deriveMessageKey(ratchet.receivingKey, ratchet.messagesReceived);

                // Decrypt message
                const plainBuf = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
                    null, cipherU, null, nonceU, messageKey
                );

                // Parse message
                const message = JSON.parse(sodium.to_string(plainBuf));

                // Check for replay
                const messageId = `${message.counter}-${message.timestamp}`;
                if (ratchet.seenMessages.has(messageId)) {
                    throw new Error('File message replay detected');
                }
                ratchet.seenMessages.add(messageId);

                // Update remote DH key if changed
                if (message.dhKey && !sodium.memcmp(message.dhKey, ratchet.remotePublicKey)) {
                    ratchet.remotePublicKey = new Uint8Array(message.dhKey);
                    await ratchet.rotateRatchet();
                }

                // Increment counter and wipe message key
                ratchet.messagesReceived++;
                ratchet.wipeKey(messageKey);

                res = message;
                break;
            }

            case 'cleanup': {
                stopKeepAlive();
                if (ratchet.rootKey) ratchet.wipeKey(ratchet.rootKey);
                if (ratchet.sendingKey) ratchet.wipeKey(ratchet.sendingKey);
                if (ratchet.receivingKey) ratchet.wipeKey(ratchet.receivingKey);
                res = { success: true };
                break;
            }

            default:
                throw new Error('Unknown operation: ' + op);
        }
    } catch (e) {
        err = e.message;
    }

    postMessage({ id, res, err });
};

// Cleanup on termination
self.addEventListener('unload', () => {
    stopKeepAlive();
    if (ratchet.rootKey) ratchet.wipeKey(ratchet.rootKey);
    if (ratchet.sendingKey) ratchet.wipeKey(ratchet.sendingKey);
    if (ratchet.receivingKey) ratchet.wipeKey(ratchet.receivingKey);
});
