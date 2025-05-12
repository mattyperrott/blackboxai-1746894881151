class NotificationManager {
    constructor() {
        this.snackbar = document.getElementById('notification-snackbar');
    }

    show(message, type = 'info') {
        // Set snackbar styling based on type
        this.snackbar.classList.remove('success', 'error', 'warning', 'info');
        this.snackbar.classList.add(type);

        // Update message and show
        this.snackbar.labelText = message;
        this.snackbar.show();
    }

    success(message) {
        this.show(message, 'success');
    }

    error(message) {
        this.show(message, 'error');
    }

    warning(message) {
        this.show(message, 'warning');
    }

    info(message) {
        this.show(message, 'info');
    }
}

// Initialize notification manager when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.notifications = new NotificationManager();
});

// Example usage:
// notifications.success('Settings saved successfully');
// notifications.error('Failed to connect to peer');
// notifications.warning('Connection unstable');
// notifications.info('New peer joined the room');
