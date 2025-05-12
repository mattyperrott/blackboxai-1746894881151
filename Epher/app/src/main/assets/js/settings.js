class Settings {
    constructor() {
        this.settingsModal = document.getElementById('settings-modal');
        this.settingsBtn = document.getElementById('settings-btn');
        this.themeToggle = document.getElementById('theme-toggle');
        
        // Security switches
        this.packetShapingSwitch = document.getElementById('packet-shaping-switch');
        this.timestampJitterSwitch = document.getElementById('timestamp-jitter-switch');
        this.keepAliveSwitch = document.getElementById('keep-alive-switch');
        this.forwardSecrecySwitch = document.getElementById('forward-secrecy-switch');
        this.screenshotPreventionSwitch = document.getElementById('screenshot-prevention-switch');
        
        // Transport radio buttons
        this.transportRadios = document.querySelectorAll('mwc-radio[name="transport"]');
        
        this.initializeListeners();
        this.loadSettings();
    }

    initializeListeners() {
        // Open settings modal
        this.settingsBtn.addEventListener('click', () => {
            this.settingsModal.show();
        });

        // Theme toggle
        this.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });

        // Save settings when switches change
        const switches = [
            this.packetShapingSwitch,
            this.timestampJitterSwitch,
            this.keepAliveSwitch,
            this.forwardSecrecySwitch,
            this.screenshotPreventionSwitch
        ];

        switches.forEach(switch_ => {
            switch_.addEventListener('change', () => {
                this.saveSettings();
            });
        });

        // Save settings when transport changes
        this.transportRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.saveSettings();
            });
        });
    }

    toggleTheme() {
        const isDark = document.body.hasAttribute('data-theme');
        if (isDark) {
            document.body.removeAttribute('data-theme');
            this.themeToggle.icon = 'dark_mode';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            this.themeToggle.icon = 'light_mode';
        }
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    }

    loadSettings() {
        // Load theme
        const theme = localStorage.getItem('theme') || 'light';
        if (theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            this.themeToggle.icon = 'light_mode';
        }

        // Load security settings
        const settings = JSON.parse(localStorage.getItem('security-settings') || '{}');
        
        this.packetShapingSwitch.checked = settings.packetShaping || false;
        this.timestampJitterSwitch.checked = settings.timestampJitter || false;
        this.keepAliveSwitch.checked = settings.keepAlive || false;
        this.forwardSecrecySwitch.checked = settings.forwardSecrecy !== false; // Default to true
        this.screenshotPreventionSwitch.checked = settings.screenshotPrevention || false;

        // Load transport setting
        const transport = localStorage.getItem('transport') || 'direct';
        this.transportRadios.forEach(radio => {
            if (radio.value === transport) {
                radio.checked = true;
            }
        });
    }

    saveSettings() {
        const settings = {
            packetShaping: this.packetShapingSwitch.checked,
            timestampJitter: this.timestampJitterSwitch.checked,
            keepAlive: this.keepAliveSwitch.checked,
            forwardSecrecy: this.forwardSecrecySwitch.checked,
            screenshotPrevention: this.screenshotPreventionSwitch.checked
        };

        localStorage.setItem('security-settings', JSON.stringify(settings));

        // Save transport setting
        const selectedTransport = Array.from(this.transportRadios).find(radio => radio.checked);
        if (selectedTransport) {
            localStorage.setItem('transport', selectedTransport.value);
        }

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
    }
}

// Initialize settings when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.settings = new Settings();
});
