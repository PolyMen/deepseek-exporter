// sync-manager.js - Менеджер синхронизации для расширения
class SyncManager {
    constructor() {
        this.providers = {
            yandex: new YandexDiskClient()
        };
        this.settings = {
            enabled: false,
            autoSync: false,
            syncOnExport: true,
            compression: false,
            providers: {
                yandex: {
                    enabled: false,
                    accessToken: null,
                    folder: 'DeepSeek-Exports',
                    syncFormats: ['json', 'doc'],
                    lastSync: null
                }
            }
        };
    }

    // Загрузка настроек из storage
    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['syncSettings'], (result) => {
                if (result.syncSettings) {
                    this.settings = { ...this.settings, ...result.syncSettings };
                    
                    // Обновляем провайдеры
                    if (this.settings.providers.yandex.accessToken) {
                        this.providers.yandex.setAccessToken(this.settings.providers.yandex.accessToken);
                    }
                }
                resolve(this.settings);
            });
        });
    }

    // Сохранение настроек в storage
    async saveSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ syncSettings: this.settings }, () => {
                resolve(true);
            });
        });
    }

    // Настройка провайдера
    async setupProvider(providerName, config) {
        if (!this.providers[providerName]) {
            return { success: false, error: `Provider ${providerName} not found` };
        }

        this.settings.providers[providerName] = {
            ...this.settings.providers[providerName],
            ...config,
            enabled: true
        };

        if (config.accessToken) {
            this.providers[providerName].setAccessToken(config.accessToken);
        }

        await this.saveSettings();
        return { success: true };
    }

    // Проверка подключения провайдера
    async testProvider(providerName) {
        if (!this.providers[providerName] || !this.settings.providers[providerName].enabled) {
            return { success: false, error: 'Provider not configured' };
        }

        const provider = this.providers[providerName];
        const result = await provider.checkConnection();

        if (result.success) {
            this.settings.providers[providerName].lastSync = new Date().toISOString();
            await this.saveSettings();
        }

        return result;
    }

    // Синхронизация экспортированных файлов
    async syncExports(exportResults, providerName = 'yandex') {
        if (!this.settings.enabled || !this.settings.providers[providerName].enabled) {
            return { success: false, error: 'Sync disabled or provider not configured' };
        }

        const provider = this.providers[providerName];
        const providerSettings = this.settings.providers[providerName];

        // Фильтруем форматы согласно настройкам
        const filteredExports = exportResults.filter(item => 
            providerSettings.syncFormats.includes(item.format)
        );

        if (filteredExports.length === 0) {
            return { success: true, skipped: true, message: 'No files to sync based on format settings' };
        }

        const result = await provider.uploadExports(filteredExports, providerSettings.folder);

        if (result.success) {
            this.settings.providers[providerName].lastSync = new Date().toISOString();
            await this.saveSettings();
        }

        return result;
    }

    // Получение статуса синхронизации
    getSyncStatus() {
        return {
            enabled: this.settings.enabled,
            providers: Object.keys(this.settings.providers).map(name => ({
                name,
                ...this.settings.providers[name],
                configured: !!this.settings.providers[name].accessToken
            }))
        };
    }

    // Включение/выключение синхронизации
    async setEnabled(enabled) {
        this.settings.enabled = enabled;
        await this.saveSettings();
        return { success: true };
    }
}

// Глобальный экземпляр менеджера
let syncManager = null;

function getSyncManager() {
    if (!syncManager) {
        syncManager = new SyncManager();
    }
    return syncManager;
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncManager, getSyncManager };
}