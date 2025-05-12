// Jest setup file
require('@testing-library/jest-dom');

// Mock IndexedDB
require('fake-indexeddb/auto');

// Mock WebCrypto API
global.crypto = {
    getRandomValues: arr => {
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
    },
    subtle: {
        // Add crypto.subtle methods as needed
        digest: async (algorithm, data) => {
            return new Uint8Array(32); // Mock hash
        }
    }
};

// Mock WebWorker
class Worker {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = null;
    }
    
    postMessage(msg) {
        // Simulate worker response
        if (this.onmessage) {
            setTimeout(() => {
                this.onmessage({ data: { id: msg.id, res: 'mock_response' } });
            }, 0);
        }
    }
    
    terminate() {}
}

global.Worker = Worker;

// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock navigator
global.navigator = {
    serviceWorker: {
        register: jest.fn().mockResolvedValue({ scope: '/' })
    }
};
