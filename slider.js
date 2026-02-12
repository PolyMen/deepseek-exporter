let currentTab = null;
let currentStats = null;
let foundChats = [];
let selectedChatIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    await initializeSlider();
    setupEventListeners();
    setupModeDescriptions();
    loadSettings();
    setupTabs();
});

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

async function initializeSlider() {
    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        if (!tabs || tabs.length === 0) {
            showStatus('❌ Не удалось найти активную вкладку', 'error');
            disableButtons();
            return;
        }

        currentTab = tabs[0];

        if (!currentTab.url) {
            showStatus('❌ Не удалось получить URL вкладки', 'error');
            disableButtons();
            return;
        }

        if (!currentTab.url.includes('chat.deepseek.com')) {
            showStatus('❌ Откройте страницу chat.deepseek.com', 'error');
            disableButtons();
            return;
        }

        await initializeSyncSystem();

        showStatus('✅ Готов к работе. Настройте фильтры при необходимости.', 'success');
        enableButtons();
    } catch (error) {
        showStatus(`❌ Ошибка инициализации: ${error.message}`, 'error');
        disableButtons();
    }
}

function setupEventListeners() {
    document.getElementById('exportFiltered').addEventListener('click', () => {
        const filters = getFilterSettings();
        const formats = getExportFormats();

        if (formats.length === 0) {
            showStatus('❌ Выберите хотя бы один формат экспорта', 'error');
            return;
        }

        let exportData = {
            type: 'filtered',
            formats: formats,
            filters: filters
        };

        if (selectedChatIds.size > 0) {
            exportData.selectedChatIds = Array.from(selectedChatIds);
        }

        executeInTab('exportChats', exportData);
    });

    document.getElementById('exportAll').addEventListener('click', () => {
        const formats = getExportFormats();
        if (formats.length === 0) {
            showStatus('❌ Выберите хотя бы один формат экспорта', 'error');
            return;
        }
        executeInTab('exportChats', { type: 'all', formats: formats });
    });

    document.getElementById('testFilter').addEventListener('click', () => {
        const filters = getFilterSettings();
        executeInTab('testFilter', { filters });
    });

    document.getElementById('exploreDB').addEventListener('click', () => {
        executeInTab('exploreDatabase');
    });

    document.getElementById('findStores').addEventListener('click', () => {
        executeInTab('findStores');
    });

    document.getElementById('testExport').addEventListener('click', () => {
        executeInTab('exportChats', {
            type: 'recent',
            formats: ['json'],
            limit: 5,
        });
    });

    document.getElementById('resetSettings').addEventListener('click', () => {
        chrome.storage.local.remove(['exportSettings'], () => {
            showStatus('✅ Настройки сброшены к значениям по умолчанию', 'success');
            loadSettings();
            hideChatsList();
        });
    });

    document.getElementById('filterMode').addEventListener('change', updateModeDescription);

    document.getElementById('searchText').addEventListener('input', saveSettings);
    document.getElementById('messageType').addEventListener('change', saveSettings);
    document.getElementById('filterMode').addEventListener('change', saveSettings);
    document.getElementById('sortOrder').addEventListener('change', saveSettings);
    document.getElementById('caseSensitive').addEventListener('change', saveSettings);
    document.querySelectorAll('.format-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', saveSettings);
    });

    setTimeout(() => setupSyncEventHandlers(), 100);
}

function setupModeDescriptions() {
    updateModeDescription();
}

function updateModeDescription() {
    const mode = document.getElementById('filterMode').value;
    const description = document.getElementById('modeDescription');

    if (mode === 'whole-chat') {
        description.innerHTML = '<strong>💬 Весь чат:</strong> Экспортируется полный диалог, если в нём есть искомый текст. Сохраняется контекст обсуждения.';
    } else {
        description.innerHTML = '<strong>🔍 Только сообщения:</strong> Экспортируются только те сообщения, которые содержат искомый текст. Идеально для сбора конкретных реплик.';
    }
}

function getFilterSettings() {
    return {
        searchText: document.getElementById('searchText').value.trim(),
        messageType: document.getElementById('messageType').value,
        filterMode: document.getElementById('filterMode').value,
        sortOrder: document.getElementById('sortOrder').value,
        caseSensitive: document.getElementById('caseSensitive').checked,
    };
}

function getExportFormats() {
    const formats = [];
    if (document.getElementById('formatJson').checked) formats.push('json');
    if (document.getElementById('formatTxt').checked) formats.push('txt');
    if (document.getElementById('formatMd').checked) formats.push('markdown');
    if (document.getElementById('formatDoc').checked) formats.push('doc');
    
    return formats;
}

function showChatsList(chats) {
    foundChats = chats;
    selectedChatIds.clear();
    
    const container = document.getElementById('chatsListContainer');
    const list = document.getElementById('chatsList');
    
    if (chats.length === 0) {
        hideChatsList();
        return;
    }
    
    list.innerHTML = '';
    chats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        
        const messageCount = chat.messages ? chat.messages.length : 0;
        const date = formatDate(chat.createTime);
        
        chatItem.innerHTML = `
            <input type="checkbox" class="chat-checkbox" id="chat-${chat.id}" checked>
            <div class="chat-info">
                <div class="chat-title">${escapeHtml(chat.title)}</div>
                <div class="chat-meta">${messageCount} сообщ. • ${date}</div>
            </div>
        `;
        list.appendChild(chatItem);
        
        const checkbox = chatItem.querySelector('.chat-checkbox');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedChatIds.add(chat.id);
            } else {
                selectedChatIds.delete(chat.id);
            }
        });
        
        selectedChatIds.add(chat.id);
    });
    
    container.style.display = 'block';
}

function hideChatsList() {
    document.getElementById('chatsListContainer').style.display = 'none';
    foundChats = [];
    selectedChatIds.clear();
}

function formatDate(timestamp) {
    if (!timestamp) return 'дата неизвестна';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'сегодня';
    } else if (diffDays === 1) {
        return 'вчера';
    } else if (diffDays < 7) {
        return `${diffDays} дней назад`;
    } else {
        return date.toLocaleDateString('ru-RU');
    }
}

function showProgress(visible) {
    const progressContainer = document.getElementById('progressContainer');
    progressContainer.style.display = visible ? 'block' : 'none';
}

function updateProgress(percent, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    progressFill.style.width = `${percent}%`;
    progressText.textContent = text;
}

function showStats(stats, filters) {
    const statsContainer = document.getElementById('statsContainer');
    const statsContent = document.getElementById('statsContent');

    if (!stats) {
        statsContainer.style.display = 'none';
        return;
    }

    let statsHTML = '';

    if (filters && filters.searchText) {
        if (filters.filterMode === 'whole-chat') {
            statsHTML = `
                <strong>📊 Результаты фильтрации:</strong><br>
                ✅ Найдено чатов: <strong>${stats.filteredChats}</strong> из ${stats.originalChats}<br>
                💬 Сообщений в них: <strong>${stats.filteredMessages}</strong><br>
                📈 Эффективность: <strong>${((stats.filteredChats / stats.originalChats) * 100).toFixed(1)}%</strong>
            `;
        } else {
            statsHTML = `
                <strong>📊 Результаты фильтрации:</strong><br>
                ✅ Найдено сообщений: <strong>${stats.filteredMessages}</strong> из ${stats.originalMessages}<br>
                💬 Чатов с совпадениями: <strong>${stats.filteredChats}</strong><br>
                📈 Эффективность: <strong>${((stats.filteredMessages / stats.originalMessages) * 100).toFixed(1)}%</strong>
            `;
        }
    } else {
        statsHTML = `
            <strong>📊 Статистика экспорта:</strong><br>
            💬 Всего чатов: <strong>${stats.filteredChats}</strong><br>
            📝 Всего сообщений: <strong>${stats.filteredMessages}</strong>
        `;
    }

    statsContent.innerHTML = statsHTML;
    statsContainer.style.display = 'block';
    currentStats = stats;
}

function loadSettings() {
    chrome.storage.local.get(['exportSettings'], (result) => {
        if (result.exportSettings) {
            const settings = result.exportSettings;

            if (settings.searchText) document.getElementById('searchText').value = settings.searchText;
            if (settings.messageType) document.getElementById('messageType').value = settings.messageType;
            if (settings.filterMode) document.getElementById('filterMode').value = settings.filterMode;
            if (settings.sortOrder) document.getElementById('sortOrder').value = settings.sortOrder;
            if (settings.caseSensitive) document.getElementById('caseSensitive').checked = settings.caseSensitive;

            if (settings.formats) {
                document.getElementById('formatJson').checked = settings.formats.includes('json');
                document.getElementById('formatTxt').checked = settings.formats.includes('txt');
                document.getElementById('formatMd').checked = settings.formats.includes('markdown');
                document.getElementById('formatDoc').checked = settings.formats.includes('doc');
            }

            updateModeDescription();
        }
    });
}

function saveSettings() {
    const settings = {
        ...getFilterSettings(),
        formats: getExportFormats(),
    };

    chrome.storage.local.set({ exportSettings: settings });
}

async function executeInTab(action, data = {}) {

    if (!currentTab) {
        showStatus('❌ Нет активной вкладки DeepSeek', 'error');
        return;
    }

    showStatus('🔄 Выполняем...', 'loading');
    showProgress(true);
    updateProgress(10, 'Подготовка...');
    disableButtons();

    try {
        const resultListener = (message, sender, sendResponse) => {
            if (message.action === 'progress') {
                updateProgress(message.data.percent, message.data.text);
            } else if (message.action === 'stats') {
                showStats(message.data.stats, message.data.filters);
            } else if (message.action === 'chatsList') {
                showChatsList(message.data.chats);
            } else if (message.action === 'result') {
                showProgress(false);
                showStatus(message.data, 'success');
                enableButtons();
                chrome.runtime.onMessage.removeListener(resultListener);
            }
            return true;
        };

        chrome.runtime.onMessage.addListener(resultListener);

        await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
                // Если функция уже существует, не перезагружаем
                if (typeof executeActionInPage !== 'undefined') {
                    return true;
                }
                return false;
            }
        }).then(async (results) => {
            if (!results[0].result) {
                // Загружаем только если не загружен
                await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    files: ['page-actions.js']
                });
            }
        });

        await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: (action, data) => {
                executeActionInPage({ action, data });
            },
            args: [action, data]
        });

        setTimeout(() => {
            chrome.runtime.onMessage.removeListener(resultListener);
            showProgress(false);
            enableButtons();
        }, 30000);
    } catch (error) {
        showProgress(false);
        showStatus(`❌ Ошибка: ${error.message}`, 'error');
        enableButtons();
    }
}

function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    if (status) {
        const formattedMessage = message
            .replace(/\\n/g, '<br>')
            .replace(/\n/g, '<br>');

        status.innerHTML = formattedMessage;
        status.className = `status ${type}`;
        status.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                if (status.style.display !== 'none') {
                    status.style.display = 'none';
                }
            }, 15000);
        }
    }
}

function disableButtons() {
    const buttons = document.querySelectorAll('.button');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
    });
}

function enableButtons() {
    const buttons = document.querySelectorAll('.button');
    buttons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });
}

// ==================== СИСТЕМА СИНХРОНИЗАЦИИ С ЯНДЕКС ДИСКОМ ====================

let syncManager = null;

// Инициализация менеджера синхронизации
async function initializeSyncManager() {
    
    try {
        // Создаем реальный клиент Яндекс Диска
        class RealYandexDiskClient {
            constructor(accessToken = null) {
                this.accessToken = accessToken;
                this.baseUrl = 'https://cloud-api.yandex.net/v1/disk';
            }
            
            setAccessToken(token) {
                this.accessToken = token;
            }
            
            async _request(endpoint, options = {}) {
                if (!this.accessToken) {
                    return { success: false, error: 'Access token not set' };
                }
                
                const url = `${this.baseUrl}${endpoint}`;
                const config = {
                    headers: {
                        'Authorization': `OAuth ${this.accessToken}`,
                        'Accept': 'application/json',
                        ...options.headers
                    },
                    ...options
                };
                
                try {
                    const response = await fetch(url, config);
                    const data = await response.json();
                    
                    return { 
                        success: response.status < 400, 
                        data, 
                        status: response.status,
                        error: response.status >= 400 ? data.description || 'Unknown error' : null
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
            
            async checkConnection() {
                const result = await this._request('/');
                
                if (result.success) {
                    return {
                        success: true,
                        user: result.data.user,
                        totalSpace: result.data.total_space,
                        usedSpace: result.data.used_space
                    };
                }
                return result;
            }
            
            async createFolder(path) {
                return await this._request(`/resources?path=${encodeURIComponent(path)}`, {
                    method: 'PUT'
                });
            }
            
            async uploadFile(filePath, content, contentType = 'text/plain') {
                const uploadUrlResult = await this._request(
                    `/resources/upload?path=${encodeURIComponent(filePath)}&overwrite=true`
                );
                
                if (!uploadUrlResult.success || !uploadUrlResult.data.href) {
                    return { 
                        success: false, 
                        error: uploadUrlResult.error || 'Failed to get upload URL' 
                    };
                }

                try {
                    const uploadResponse = await fetch(uploadUrlResult.data.href, {
                        method: 'PUT',
                        headers: { 'Content-Type': contentType },
                        body: content
                    });
                    
                    return { 
                        success: uploadResponse.status === 201, 
                        status: uploadResponse.status 
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
            
            async uploadExports(exportResults, baseFolder = 'DeepSeek-Exports') {
                if (!exportResults || exportResults.length === 0) {
                    return { success: false, error: 'No files to upload' };
                }
                
                const results = [];
                let successCount = 0;

                try {
                    await this.createFolder(baseFolder);
                    
                    const formats = [...new Set(exportResults.map(item => item.format))];
                    for (const format of formats) {
                        const folderPath = `${baseFolder}/${format.toUpperCase()}`;
                        await this.createFolder(folderPath);
                    }

                    for (const exportItem of exportResults) {
                        const { format, content, filename, blob } = exportItem;
                        const filePath = `${baseFolder}/${format.toUpperCase()}/${filename}`;
                        
                        const contentType = this._getContentType(format);
                        const fileContent = blob || content;
                        
                        const result = await this.uploadFile(filePath, fileContent, contentType);
                        
                        results.push({
                            format,
                            filename,
                            path: filePath,
                            success: result.success,
                            error: result.error
                        });

                        if (result.success) successCount++;
                    }

                    return {
                        success: successCount === exportResults.length,
                        results,
                        uploaded: successCount,
                        total: exportResults.length
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        results,
                        uploaded: successCount,
                        total: exportResults.length
                    };
                }
            }
            
            _getContentType(format) {
                const types = {
                    'json': 'application/json',
                    'txt': 'text/plain; charset=utf-8',
                    'markdown': 'text/markdown; charset=utf-8',
                    'doc': 'text/html',
                    'md': 'text/markdown; charset=utf-8'
                };
                return types[format] || 'text/plain';
            }
        }

        // Менеджер синхронизации
        class SyncManager {
            constructor() {
                this.providers = {
                    yandex: new RealYandexDiskClient()
                };
                this.settings = {
                    enabled: false,
                    autoSync: false,
                    providers: {
                        yandex: {
                            enabled: false,
                            accessToken: null,
                            folder: "DeepSeek-Exports",
                            syncFormats: ["json", "doc"],
                            lastSync: null,
                            configured: false
                        }
                    }
                };
            }
            
            async loadSettings() {
                return new Promise((resolve) => {
                    chrome.storage.local.get(["syncSettings"], (result) => {
                        if (result.syncSettings) {
                            this.settings = { ...this.settings, ...result.syncSettings };
                            if (this.settings.providers.yandex.accessToken) {
                                this.providers.yandex.setAccessToken(this.settings.providers.yandex.accessToken);
                            }
                        }
                        resolve(this.settings);
                    });
                });
            }
            
            async saveSettings() {
                return new Promise((resolve) => {
                    chrome.storage.local.set({ syncSettings: this.settings }, () => {
                        resolve(true);
                    });
                });
            }
            
            async setupProvider(providerName, config) {
                this.settings.providers[providerName] = {
                    ...this.settings.providers[providerName],
                    ...config,
                    enabled: true,
                    configured: true
                };
                
                if (this.providers[providerName] && config.accessToken) {
                    this.providers[providerName].setAccessToken(config.accessToken);
                }
                
                await this.saveSettings();
                return { success: true };
            }
            
            async testProvider(providerName) {
                if (!this.providers[providerName]) {
                    return { success: false, error: 'Provider not found' };
                }
                return await this.providers[providerName].checkConnection();
            }
            
            async syncExports(exportResults, providerName = 'yandex') {
                if (!this.providers[providerName]) {
                    return { success: false, error: 'Provider not configured' };
                }
                
                const result = await this.providers[providerName].uploadExports(exportResults);
                
                if (result.success) {
                    this.settings.providers[providerName].lastSync = new Date().toISOString();
                    await this.saveSettings();
                }
                
                return result;
            }
            
            getSyncStatus() {
                return this.settings;
            }
            
            async setEnabled(enabled) {
                this.settings.enabled = enabled;
                await this.saveSettings();
                return { success: true };
            }
        }
        
        window.syncManager = new SyncManager();
        await window.syncManager.loadSettings();
        
    } catch (error) {

        window.syncManager = createStubSyncManager();
    }
}

// Заглушка для тестирования
function createStubSyncManager() {
    return {
        settings: {
            enabled: false,
            providers: { yandex: { configured: false } }
        },
        loadSettings: () => Promise.resolve(),
        saveSettings: () => Promise.resolve(),
        setupProvider: () => Promise.resolve({ success: true }),
        testProvider: () => Promise.resolve({ success: true }),
        syncExports: () => Promise.resolve({ success: true }),
        getSyncStatus: function() { return this.settings; },
        setEnabled: () => Promise.resolve({ success: true })
    };
}

// Интеграция автосинхронизации с экспортером
function setupAutoSyncIntegration() {
    const originalExecuteInTab = window.executeInTab;
    
    if (!originalExecuteInTab) return;
    
    window.executeInTab = async function(action, data = {}) {
        const result = await originalExecuteInTab.call(this, action, data);
        
        if (action === 'exportChats' && document.getElementById('autoSync')?.checked) {
            setTimeout(async () => {
                await triggerAutoSync(data);
            }, 2000);
        }
        
        return result;
    };
}

// Запуск автосинхронизации после экспорта
async function triggerAutoSync(exportData) {
    if (!window.syncManager) return;
    
    const status = window.syncManager.getSyncStatus();
    if (!status.enabled || !status.providers.yandex.configured) return;
    
    showStatus('🔄 Синхронизируем файлы с Яндекс Диском...', 'loading');
    
    try {
        const formats = exportData.formats || ['json', 'doc'];
        const filters = exportData.filters || {};
        
        const mockExports = formats.map(format => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            let filename = `deepseek-export-${timestamp}.${format}`;
            
            if (filters.searchText) {
                const searchSlug = filters.searchText.substring(0, 20).replace(/[^a-z0-9]/gi, '-');
                filename = `deepseek-${filters.filterMode === 'whole-chat' ? 'full' : 'filtered'}-${searchSlug}-${timestamp}.${format}`;
            }
            
            let content = '';
            if (format === 'json') {
                content = JSON.stringify({
                    exportType: exportData.type,
                    filters: filters,
                    timestamp: new Date().toISOString()
                }, null, 2);
            } else if (format === 'doc') {
                content = `<html><body><h1>DeepSeek Export</h1><p>Тип: ${exportData.type}</p></body></html>`;
            } else {
                content = `DeepSeek Export\nТип: ${exportData.type}\nВремя: ${new Date().toLocaleString()}`;
            }
            
            return {
                format: format,
                filename: filename,
                content: content,
                blob: new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' })
            };
        });
        
        const result = await window.syncManager.syncExports(mockExports, 'yandex');
        
        if (result.success) {
            showStatus(`✅ Синхронизация завершена! Загружено ${result.uploaded} файлов`, 'success');
            updateSyncUI();
        } else {
            showStatus(`❌ Ошибка синхронизации: ${result.error}`, 'error');
        }
        
    } catch (error) {
        showStatus(`❌ Ошибка синхронизации: ${error.message}`, 'error');
    }
}

// Обновление UI синхронизации
function updateSyncUI() {
    if (!window.syncManager) return;
    
    const status = window.syncManager.getSyncStatus();
    const yandexProvider = status.providers.yandex;
    
    const syncStatus = document.getElementById('syncStatus');
    const syncSetup = document.getElementById('syncSetup');
    const autoSync = document.getElementById('autoSync');
    const lastSync = document.getElementById('lastSync');
    
    if (!syncStatus || !syncSetup) return;
    
    if (yandexProvider && yandexProvider.configured) {
        syncStatus.style.display = 'block';
        syncSetup.style.display = 'none';
        if (autoSync) autoSync.checked = status.enabled;
        
        if (yandexProvider.lastSync && lastSync) {
            const date = new Date(yandexProvider.lastSync);
            lastSync.textContent = date.toLocaleDateString('ru-RU');
        }
    } else {
        syncStatus.style.display = 'none';
        syncSetup.style.display = 'block';
        if (autoSync) autoSync.checked = false;
    }
}

// Обработчики для UI синхронизации
function setupSyncEventHandlers() {
    const setupButton = document.getElementById('setupYandexDisk');
    const modal = document.getElementById('yandexModal');
    const saveButton = document.getElementById('saveYandexToken');
    const testButton = document.getElementById('testYandexConnection');
    
    if (!setupButton || !modal || !saveButton || !testButton) return;
    
    setupButton.addEventListener('click', () => {
        modal.style.display = 'flex';
    });
    
    document.querySelector('.modal-close').addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('modalStatus').innerHTML = '';
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'yandexModal') {
            modal.style.display = 'none';
            document.getElementById('modalStatus').innerHTML = '';
        }
    });
    
    saveButton.addEventListener('click', async () => {
        const token = document.getElementById('yandexToken').value.trim();
        const status = document.getElementById('modalStatus');
        
        if (!token) {
            showModalStatus('❌ Введите OAuth токен', 'error');
            return;
        }
        
        try {
            showModalStatus('🔄 Сохраняем токен...', 'loading');
            await window.syncManager.setupProvider('yandex', { accessToken: token });
            
            const testResult = await window.syncManager.testProvider('yandex');
            
            if (testResult.success) {
                showModalStatus('✅ Токен сохранен! Соединение установлено.', 'success');
                updateSyncUI();
                setTimeout(() => modal.style.display = 'none', 2000);
            } else {
                showModalStatus(`❌ Ошибка соединения: ${testResult.error}`, 'error');
            }
        } catch (error) {
            showModalStatus(`❌ Ошибка: ${error.message}`, 'error');
        }
    });
    
    testButton.addEventListener('click', async () => {
        const status = document.getElementById('modalStatus');
        
        try {
            showModalStatus('🔄 Проверяем соединение...', 'loading');
            const result = await window.syncManager.testProvider('yandex');
            
            if (result.success) {
                showModalStatus('✅ Соединение установлено!', 'success');
            } else {
                showModalStatus(`❌ Ошибка: ${result.error}`, 'error');
            }
        } catch (error) {
            showModalStatus(`❌ Ошибка: ${error.message}`, 'error');
        }
    });
    
    document.getElementById('autoSync').addEventListener('change', async function() {
        try {
            await window.syncManager.setEnabled(this.checked);
            showStatus(`Автосинхронизация ${this.checked ? 'включена' : 'выключена'}`, 'success');
        } catch (error) {
            showStatus(`❌ Ошибка: ${error.message}`, 'error');
        }
    });
}

// Вспомогательная функция для статуса модального окна
function showModalStatus(message, type) {
    const modalStatus = document.getElementById('modalStatus');
    const colors = {
        success: '#155724', error: '#721c24', warning: '#856404', loading: '#856404'
    };
    const backgrounds = {
        success: '#d4edda', error: '#f8d7da', warning: '#fff3cd', loading: '#fff3cd'
    };
    
    modalStatus.innerHTML = `<div style="color: ${colors[type]}; background: ${backgrounds[type]}; padding: 10px; border-radius: 6px; border: 1px solid ${colors[type]}22;">${message}</div>`;
}

// Инициализация системы синхронизации
async function initializeSyncSystem() {
    await initializeSyncManager();
    setupAutoSyncIntegration();
    updateSyncUI();
}

// ==================== КОНЕЦ СИСТЕМЫ СИНХРОНИЗАЦИИ ====================

window.addEventListener('beforeunload', () => {
    enableButtons();
});