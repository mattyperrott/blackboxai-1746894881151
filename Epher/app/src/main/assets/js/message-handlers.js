// Message handling functions
export function appendMessage(text, isMine = false, isPending = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMine ? 'message-sent' : 'message-received'}`;
    messageDiv.dataset.timestamp = Date.now();
    
    const time = new Date().toLocaleTimeString();
    const statusClass = isPending ? 'pending' : 'sent';
    
    messageDiv.innerHTML = `
        <div class="message-content">
            ${escapeHtml(text)}
            <div class="message-metadata">
                <span class="message-status ${statusClass}" title="${isPending ? 'Sending...' : 'Sent'}">
                    <i class="fas ${isPending ? 'fa-clock' : 'fa-check'}"></i>
                </span>
                <span class="read-receipt hidden">
                    <i class="fas fa-check-double"></i>
                </span>
                <span class="timestamp">${time}</span>
                <span class="sender">${isMine ? username : 'peer'}</span>
            </div>
        </div>
        ${isMine ? `
            <div class="message-actions hidden">
                <button class="edit-message" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-message" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        ` : ''}
    `;
    
    // Add message actions event listeners
    if (isMine) {
        const actionsDiv = messageDiv.querySelector('.message-actions');
        messageDiv.addEventListener('mouseenter', () => actionsDiv.classList.remove('hidden'));
        messageDiv.addEventListener('mouseleave', () => actionsDiv.classList.add('hidden'));
        
        // Edit message handler
        messageDiv.querySelector('.edit-message')?.addEventListener('click', () => {
            editMessage(messageDiv);
        });
        
        // Delete message handler
        messageDiv.querySelector('.delete-message')?.addEventListener('click', () => {
            deleteMessage(messageDiv);
        });
    }
    
    elements.messages.appendChild(messageDiv);
    messageDiv.scrollIntoView({ behavior: 'smooth' });
    
    // Send read receipt for received messages
    if (!isMine) {
        sendReadReceipt(messageDiv.dataset.timestamp);
    }
    
    return messageDiv;
}

// Edit message handler
export async function editMessage(messageDiv) {
    try {
        const content = messageDiv.querySelector('.message-content');
        const originalText = content.textContent.trim();
        
        // Create edit input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'edit-message-input';
        
        // Replace content with input
        content.innerHTML = '';
        content.appendChild(input);
        input.focus();
        
        // Handle edit completion
        const handleEdit = async () => {
            const newText = input.value.trim();
            if (newText && newText !== originalText) {
                try {
                    // Send edited message
                    const messageData = {
                        type: 'edit',
                        originalTimestamp: messageDiv.dataset.timestamp,
                        text: newText,
                        csrfToken
                    };
                    
                    const env = await seal(messageData);
                    await AndroidBridge.sendMessage(JSON.stringify(env));
                    
                    // Update UI
                    content.innerHTML = `
                        ${escapeHtml(newText)}
                        <span class="edited-indicator">(edited)</span>
                    `;
                    
                    logger.info('Message', 'Message edited successfully', {
                        timestamp: messageDiv.dataset.timestamp
                    });
                } catch (error) {
                    logger.error('Message', 'Failed to edit message', { error });
                    showError('Failed to edit message: ' + error.message);
                    content.innerHTML = escapeHtml(originalText);
                }
            } else {
                content.innerHTML = escapeHtml(originalText);
            }
        };
        
        input.addEventListener('blur', handleEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleEdit();
            }
        });
        
    } catch (error) {
        logger.error('Message', 'Failed to initiate message edit', { error });
        showError('Failed to edit message: ' + error.message);
    }
}

// Delete message handler
export async function deleteMessage(messageDiv) {
    try {
        if (!confirm('Are you sure you want to delete this message?')) {
            return;
        }
        
        const messageData = {
            type: 'delete',
            timestamp: messageDiv.dataset.timestamp,
            csrfToken
        };
        
        const env = await seal(messageData);
        await AndroidBridge.sendMessage(JSON.stringify(env));
        
        // Add deletion animation
        messageDiv.classList.add('message-deleted');
        setTimeout(() => {
            messageDiv.remove();
        }, 300);
        
        logger.info('Message', 'Message deleted successfully', {
            timestamp: messageDiv.dataset.timestamp
        });
        
    } catch (error) {
        logger.error('Message', 'Failed to delete message', { error });
        showError('Failed to delete message: ' + error.message);
    }
}

// Send read receipt
export async function sendReadReceipt(messageTimestamp) {
    try {
        const receiptData = {
            type: 'read_receipt',
            messageTimestamp,
            timestamp: Date.now(),
            csrfToken
        };
        
        const env = await seal(receiptData);
        await AndroidBridge.sendMessage(JSON.stringify(env));
        
        logger.info('Message', 'Read receipt sent', {
            messageTimestamp
        });
    } catch (error) {
        logger.error('Message', 'Failed to send read receipt', { error });
    }
}
