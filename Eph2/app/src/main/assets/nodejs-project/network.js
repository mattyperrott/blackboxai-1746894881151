const Hyperswarm = require('hyperswarm');
const Hyperbeam = require('hyperbeam');
const sodium = require('libsodium-wrappers');

// Constants for packet shaping and timing
const PACKET_SIZE = 256; // Fixed packet size for padding
const JITTER_MAX = 250; // Maximum timestamp jitter in ms
const KEEPALIVE_INTERVAL = 2000; // Keep-alive interval in ms

class NetworkManager {
    constructor() {
        this.sockets = new Set();
        this.swarm = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.onMessageCallback = null;
        this.keepAliveInterval = null;
        this.transportMode = 'direct'; // 'direct' or 'yggdrasil'
    }

    async initialize(roomId, preKeyBundle, onMessage) {
        try {
            await sodium.ready;
            this.onMessageCallback = onMessage;

            // Generate room key using sodium
            const keyBuf = sodium.crypto_generichash(32, Buffer.from(roomId));
            
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
            }, SecurityConfig.network.connectionTimeout);
            
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
                console.log('New peer connected');
                
                const beam = new Hyperbeam(socket);
                this.sockets.add(beam);
                this.isConnected = true;

                // Handle incoming data with packet shaping
                beam.on('data', (data) => this.handleIncomingData(data, beam));

                // Handle disconnection
                beam.on('end', () => this.handlePeerDisconnect(beam));
                beam.on('error', (error) => {
                    console.error('Beam error:', error);
                    this.handlePeerDisconnect(beam);
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

    handleIncomingData(data, beam) {
        try {
            // Remove padding
            const unpadded = this.removePacketPadding(data);
            
            // Parse the message
            const message = JSON.parse(unpadded.toString());
            
            // Handle keep-alive packets
            if (message.type === 'keepalive') {
                this.handleKeepAlive(beam);
                return;
            }

            // Process actual message
            this.onMessageCallback(message);
            
        } catch (error) {
            console.error('Failed to process incoming data:', error);
        }
    }

    handleKeepAlive(beam) {
        try {
            // Send keep-alive response
            const response = this.padPacket(Buffer.from(JSON.stringify({
                type: 'keepalive_ack',
                timestamp: Date.now()
            })));
            beam.write(response);
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
                // Bandwidth check before sending
                if (this.canSendData(socket)) {
                    socket.write(keepAlive);
                } else {
                    console.warn('Bandwidth limit reached, skipping keep-alive for socket');
                }
            } catch (error) {
                console.error('Failed to send keep-alive:', error);
                this.handlePeerDisconnect(socket);
            }
        }
    }

    canSendData(socket) {
        // Implement bandwidth management logic here
        // For now, allow all
        return true;
    }

    handlePeerDisconnect(beam) {
        this.sockets.delete(beam);
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

    async initialize(roomId, preKeyBundle, onMessage) {
        this.savedParams = { roomId, preKeyBundle, onMessage };
        try {
            await sodium.ready;
            this.onMessageCallback = onMessage;

            // Generate room key using sodium
            const keyBuf = sodium.crypto_generichash(32, Buffer.from(roomId));
            
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
            }, SecurityConfig.network.connectionTimeout);
            
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

    padPacket(data) {
        const currentSize = data.length;
        const targetSize = Math.ceil(currentSize / PACKET_SIZE) * PACKET_SIZE;
        const padding = Buffer.alloc(targetSize - currentSize);
        sodium.randombytes_buf(padding);
        return Buffer.concat([data, padding]);
    }

    removePacketPadding(data) {
        // Find the actual message end (before padding)
        let end = data.length;
        while (end > 0 && data[end - 1] === 0) end--;
        return data.slice(0, end);
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
