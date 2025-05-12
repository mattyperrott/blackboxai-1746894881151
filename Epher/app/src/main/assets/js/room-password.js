import { generateRoomId } from './utils.js';

// Charset for password generation
const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

// Generate random password of given length
export function generateRandomPassword(length = 32) {
    let password = '';
    const array = new Uint32Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        password += charset[array[i] % charset.length];
    }
    return password;
}

// Derive key using Argon2id (using argon2-browser or similar library)
export async function deriveKey(password, roomId) {
    // Use roomId as salt
    const salt = new TextEncoder().encode(roomId);

    // Argon2id parameters
    const config = {
        pass: password,
        salt: salt,
        time: 3,
        mem: 65536,
        hashLen: 32,
        parallelism: 1,
        type: 2 // Argon2id
    };

    // Use argon2-browser or similar to derive key
    // Assuming argon2 is globally available
    const hash = await argon2.hash(config);
    return hash.hashHex;
}

// Compute HMAC for proof-of-knowledge
export async function computeHMAC(keyHex, message) {
    const keyBytes = hexStringToUint8Array(keyHex);
    const msgBytes = new TextEncoder().encode(message);

    const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
    return bufferToHex(signature);
}

// Helper: convert hex string to Uint8Array
function hexStringToUint8Array(hexString) {
    if (hexString.length % 2 !== 0) throw new Error('Invalid hex string');
    const array = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        array[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return array;
}

// Helper: convert ArrayBuffer to hex string
function bufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray).map(b => b.toString(16).padStart(2, '0')).join('');
}
