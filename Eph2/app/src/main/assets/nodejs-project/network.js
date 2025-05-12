const Hyperswarm = require('hyperswarm');
const sodium = require('libsodium-wrappers');

// Constants for packet shaping and timing
const PACKET_SIZE = 256; // Fixed packet size for padding
const JITTER_MAX = 250; // Maximum timestamp jitter in ms
const KEEPALIVE_INTERVAL = 2000; // Keep-alive interval in ms

class NetworkManager {
    constructor() {
        this.sockets = new Set();
        this.verifiedPeers = new Map(); // Track verified peers and their keys
        this.pendingVerifications = new Map(); // Track ongoing verifications
        this.swarm = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.onMessageCallback = null;
        this.keepAliveInterval = null;
        this.transportMode = 'direct'; // 'direct' or 'yggdrasil'
        this.roomPSK = null; // Room pre-shared key for HMAC
    }

    async initialize(roomId, preKeyBundle, onMessage) {
        try {
            await sodium.ready;
            this.onMessageCallback = onMessage;

            // Generate room key using sodium
            const keyBuf = sodium.crypto_generichash(32, Buffer.from(roomId));
            
            // Derive room PSK for HMAC verification
            this.roomPSK = sodium.crypto_generichash(32, Buffer.from(roomId + preKeyBundle.toString()));

            // Initialize swarm with appropriate transport
            this.swarm = new Hyperswarm({
                // Configure for Yggdrasil if enabled
                bootstrap: this.transportMode === 'yggdrasil' ? 
                    ['yggdrasil://bootstrap.node'] : undefined
            });
            
            // Set up event handlers
            this.setupSwarmHandlers();

            // Setup connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (!this.isConnected) {
                    console.warn('Connection timeout reached, attempting fallback transport');
                    this.setTransportMode(this.transportMode === 'direct' ? 'yggdrasil' : 'direct');
                }
            }, 30000); // 30 seconds
            
            // Join the swarm with the room key
            this.swarm.join(keyBuf, { 
                client: true, 
                server: true,
                announce: true,
                lookup: true
            });

            // Start keep-alive mechanism
            this.startKeepAlive();
            
            console.log('Initialized network with transport:', this.transportMode);

        } catch (error) {
            console.error('Failed to initialize network:', error);
            throw error;
        }
    }

    setupSwarmHandlers() {
        this.swarm.on('connection', (socket) => {
            try {
                console.log('New peer connected, initiating verification');
                
                // Generate random challenge
                const challenge = sodium.randombytes_buf(32);
                const verificationTimeout = setTimeout(() => {
                    if (this.pendingVerifications.has(socket)) {
                        console.warn('Peer verification timeout');
                        this.handlePeerDisconnect(socket);
                    }
                }, 10000); // 10 seconds timeout

                // Store verification state
                this.pendingVerifications.set(socket, {
                    challenge,
                    timeout: verificationTimeout
                });

                // Send challenge
                const challengeMsg = this.padPacket(Buffer.from(JSON.stringify({
                    type: 'verification_challenge',
                    challenge: Array.from(challenge)
                })));
                socket.write(challengeMsg);

                // Set up message handlers
                socket.on('data', (data) => this.handleIncomingData(data, socket));
                socket.on('end', () => this.handlePeerDisconnect(socket));
                socket.on('error', (error) => {
                    console.error('Socket error:', error);
                    this.handlePeerDisconnect(socket);
                });

            } catch (error) {
                console.error('Failed to handle new connection:', error);
            }
        });

        this.swarm.on('peer', (peer) => {
            console.log('Discovered peer:', peer);
        });

        this.swarm.on('error', (error) => {
            console.error('Swarm error:', error);
            this.attemptReconnect();
        });
    }

    async verifyPeer(socket, challenge, response) {
        try {
            const verification = this.pendingVerifications.get(socket);
            if (!verification) {
                console.warn('No pending verification for peer');
                return false;
            }

            // Clear verification timeout
            clearTimeout(verification.timeout);
            this.pendingVerifications.delete(socket);

            // Verify HMAC response
            const isValid = sodium.crypto_auth_verify(new Uint8Array(response), verification.challenge, this.roomPSK);

            if (isValid) {
                // Add to verified peers
                this.verifiedPeers.set(socket, {
                    verifiedAt: Date.now(),
                    challenge: verification.challenge
                });
                this.sockets.add(socket);
                this.isConnected = true;

                // Send verification success
                const successMsg = this.padPacket(Buffer.from(JSON.stringify({
                    type: 'verification_success',
                    timestamp: Date.now()
                })));
                socket.write(successMsg);

                return true;
            }

            return false;
        } catch (error) {
            console.error('Peer verification failed:', error);
            return false;
        }
    }

    async handleVerificationChallenge(socket, challenge) {
        try {
            // Calculate HMAC response using room PSK
            const response = sodium.crypto_auth(new Uint8Array(challenge), this.roomPSK);
            
            // Send response
            const responseMsg = this.padPacket(Buffer.from(JSON.stringify({
                type: 'verification_response',
                response: Array.from(response)
            })));
            socket.write(responseMsg);
        } catch (error) {
            console.error('Failed to handle verification challenge:', error);
        }
    }

    handleIncomingData(data, socket) {
        try {
            // Remove padding with length prefix
            const unpadded = this.removePacketPadding(data);
            
            // Parse the message
            const message = JSON.parse(unpadded.toString());

            // Handle verification messages
            if (message.type === 'verification_challenge') {
                this.handleVerificationChallenge(socket, message.challenge);
                return;
            }
            
            if (message.type === 'verification_response') {
                this.verifyPeer(socket, message.challenge, message.response).then(isValid => {
                    if (!isValid) {
                        console.warn('Invalid verification response');
                        this.handlePeerDisconnect(socket);
                    }
                });
                return;
            }

            // Only process messages from verified peers
            if (!this.verifiedPeers.has(socket)) {
                console.warn('Received message from unverified peer');
                return;
            }
            
            // Handle keep-alive packets
            if (message.type === 'keepalive') {
                this.handleKeepAlive(socket);
                return;
            }

            // Process actual message
            this.onMessageCallback(message);
            
        } catch (error) {
            console.error('Failed to process incoming data:', error);
        }
    }

    handleKeepAlive(socket) {
        try {
            // Send keep-alive response
            const response = this.padPacket(Buffer.from(JSON.stringify({
                type: 'keepalive_ack',
                timestamp: Date.now()
            })));
            socket.write(response);
        } catch (error) {
            console.error('Failed to handle keep-alive:', error);
        }
    }

    startKeepAlive() {
        if (this.keepAliveInterval) return;
        
        this.keepAliveInterval = setInterval(() => {
            if (this.isConnected) {
                this.broadcastKeepAlive();
            }
        }, KEEPALIVE_INTERVAL);
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    broadcastKeepAlive() {
        const keepAlive = this.padPacket(Buffer.from(JSON.stringify({
            type: 'keepalive',
            timestamp: this.addJitter(Date.now())
        })));

        for (const socket of this.sockets) {
            try {
                socket.write(keepAlive);
            } catch (error) {
                console.error('Failed to send keep-alive:', error);
                this.handlePeerDisconnect(socket);
            }
        }
    }

    addJitter(timestamp) {
        const jitter = (Math.random() * JITTER_MAX * 2) - JITTER_MAX;
        return timestamp + jitter;
    }

    async sendMessage(message) {
        if (!this.isConnected) {
            throw new Error('Not connected to any peers');
        }

        try {
            // Add timestamp jitter
            message.timestamp = this.addJitter(Date.now());
            
            // Convert to buffer and pad
            const messageBuffer = this.padPacket(Buffer.from(JSON.stringify(message)));
            
            // Send to all peers
            for (const socket of this.sockets) {
                try {
                    socket.write(messageBuffer);
                } catch (error) {
                    console.error('Failed to send to peer:', error);
                    this.handlePeerDisconnect(socket);
                }
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }

    padPacket(data) {
        // Add 4-byte length prefix
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32BE(data.length, 0);
        const totalLength = 4 + data.length;
        const paddedLength = Math.ceil(totalLength / PACKET_SIZE) * PACKET_SIZE;
        const paddingLength = paddedLength - totalLength;
        const padding = Buffer.alloc(paddingLength, 0); // zero padding
        return Buffer.concat([lengthBuffer, data, padding], paddedLength);
    }

    removePacketPadding(data) {
        // Read 4-byte length prefix
        if (data.length < 4) {
            throw new Error('Invalid packet: too short for length prefix');
        }
        const length = data.readUInt32BE(0);
        if (length > data.length - 4) {
            throw new Error('Invalid packet: length prefix exceeds data size');
        }
        return data.slice(4, 4 + length);
    }

    handlePeerDisconnect(socket) {
        this.sockets.delete(socket);
        if (this.sockets.size === 0) {
            this.isConnected = false;
            this.attemptReconnect();
        }
        // Clear connection timeout if any
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    attemptReconnect() {
        if (this.reconnectTimer) return;
        
        this.reconnectTimer = setTimeout(() => {
            try {
                if (this.swarm && !this.isConnected) {
                    console.log('Attempting to reconnect...');
                    this.swarm.rejoin();
                }
            } catch (error) {
                console.error('Reconnection attempt failed:', error);
            } finally {
                this.reconnectTimer = null;
            }
        }, 5000);
    }

    setTransportMode(mode) {
        if (mode !== 'direct' && mode !== 'yggdrasil') {
            throw new Error('Invalid transport mode');
        }
        
        if (mode === this.transportMode) return;
        
        this.transportMode = mode;
        
        // Reinitialize network with new transport using saved parameters
        if (this.swarm) {
            this.cleanup();
            if (this.savedParams) {
                const { roomId, preKeyBundle, onMessage } = this.savedParams;
                this.initialize(roomId, preKeyBundle, onMessage);
            }
        }
    }

    cleanup() {
        this.stopKeepAlive();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        for (const socket of this.sockets) {
            try {
                socket.end();
            } catch (error) {
                console.error('Error closing socket:', error);
            }
        }

        this.sockets.clear();
        
        if (this.swarm) {
            try {
                this.swarm.destroy();
            } catch (error) {
                console.error('Error destroying swarm:', error);
            }
        }
    }
}

// Export singleton instance
const networkManager = new NetworkManager();
module.exports = {
    initNetwork: (roomId, preKeyBundle, onRx) => networkManager.initialize(roomId, preKeyBundle, onRx),
    sendMessage: (message) => networkManager.sendMessage(message),
    setTransport: (mode) => networkManager.setTransportMode(mode),
    cleanup: () => networkManager.cleanup()
};
