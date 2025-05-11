class MessageHandler {
    constructor() {
        this.messagesList = document.getElementById('messages');
        this.messageInput = document.getElementById('msg');
        this.sendButton = document.getElementById('send-btn');
        this.fileUploadButton = document.getElementById('file-upload-btn');
        this.fileInput = document.getElementById('file-upload');

        this.initializeListeners();
    }

    initializeListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.fileUploadButton.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });
    }

    createMessageElement(message, isOutgoing = false) {
        const messageItem = document.createElement('mwc-list-item');
        messageItem.twoline = true;
        messageItem.graphic = 'avatar';

        // Message container with Material Design 3 elevation and shape
        const container = document.createElement('div');
        container.className = `message-container ${isOutgoing ? 'outgoing' : 'incoming'}`;

        // Message content
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = message.text;

        // Metadata (timestamp, status)
        const metadata = document.createElement('div');
        metadata.className = 'message-metadata';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date(message.timestamp).toLocaleTimeString();

        metadata.appendChild(timestamp);

        if (isOutgoing) {
            const status = document.createElement('mwc-icon');
            status.className = 'message-status';
            status.textContent = message.delivered ? 'done_all' : 'done';
            metadata.appendChild(status);
        }

        container.appendChild(content);
        container.appendChild(metadata);
        messageItem.appendChild(container);

        return messageItem;
    }

    addMessage(message, isOutgoing = false) {
        const messageElement = this.createMessageElement(message, isOutgoing);
        
        // Add with animation
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'translateY(20px)';
        this.messagesList.appendChild(messageElement);

        // Trigger animation
        requestAnimationFrame(() => {
            messageElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            messageElement.style.opacity = '1';
            messageElement.style.transform = 'translateY(0)';
        });

        // Scroll to bottom
        this.scrollToBottom();
    }

    scrollToBottom() {
        const chatArea = document.getElementById('chat-area');
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    async sendMessage() {
        const text = this.messageInput.value.trim();
        if (!text) return;

        const message = {
            text,
            timestamp: Date.now(),
            delivered: false
        };

        // Clear input
        this.messageInput.value = '';

        // Add message to UI
        this.addMessage(message, true);

        try {
            // Simulate sending (replace with actual send logic)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Update status
            message.delivered = true;
            this.updateMessageStatus(message);
            
            window.notifications.success('Message sent');
        } catch (error) {
            window.notifications.error('Failed to send message');
        }
    }

    updateMessageStatus(message) {
        const messageElements = this.messagesList.querySelectorAll('.message-container.outgoing');
        for (const element of messageElements) {
            const timestamp = element.querySelector('.message-timestamp');
            if (timestamp.textContent === new Date(message.timestamp).toLocaleTimeString()) {
                const status = element.querySelector('.message-status');
                if (status) {
                    status.textContent = message.delivered ? 'done_all' : 'done';
                }
                break;
            }
        }
    }

    async handleFileUpload(file) {
        try {
            window.uiState.startLoading('file-upload');
            
            // Simulate file upload (replace with actual upload logic)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const message = {
                text: `File: ${file.name}`,
                timestamp: Date.now(),
                delivered: true
            };

            this.addMessage(message, true);
            window.notifications.success('File uploaded successfully');
        } catch (error) {
            window.notifications.error('Failed to upload file');
        } finally {
            window.uiState.stopLoading('file-upload');
            this.fileInput.value = '';
        }
    }
}

// Initialize message handler when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.messages = new MessageHandler();
});
