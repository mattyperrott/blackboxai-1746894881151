export class PrivacySettingsManager {
    constructor() {
        this.settings = {
            transportMode: 'direct',
            loggingEnabled: false
        };
        this.loadSettings();
    }

    loadSettings() {
        const saved = localStorage.getItem('privacySettings');
        if (saved) {
            try {
                this.settings = JSON.parse(saved);
            } catch {
                this.settings = {
                    transportMode: 'direct',
                    loggingEnabled: false
                };
            }
        }
    }

    saveSettings() {
        localStorage.setItem('privacySettings', JSON.stringify(this.settings));
    }

    setTransportMode(mode) {
        if (mode === 'direct' || mode === 'yggdrasil') {
            this.settings.transportMode = mode;
            this.saveSettings();
        }
    }

    toggleLogging() {
        this.settings.loggingEnabled = !this.settings.loggingEnabled;
        this.saveSettings();
    }

    isLoggingEnabled() {
        return this.settings.loggingEnabled;
    }

    getTransportMode() {
        return this.settings.transportMode;
    }
}

export const privacySettingsManager = new PrivacySettingsManager();
