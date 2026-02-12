// yandex-disk-client.js - Клиент для работы с Яндекс Диском
class YandexDiskClient {
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

    // Проверка соединения и валидности токена
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

    // Создание папки
    async createFolder(path) {
        return await this._request(`/resources?path=${encodeURIComponent(path)}`, {
            method: 'PUT'
        });
    }

    // Загрузка файла
    async uploadFile(filePath, content, contentType = 'text/plain') {
        // Получаем URL для загрузки
        const uploadUrlResult = await this._request(
            `/resources/upload?path=${encodeURIComponent(filePath)}&overwrite=true`
        );
        
        if (!uploadUrlResult.success || !uploadUrlResult.data.href) {
            return { 
                success: false, 
                error: uploadUrlResult.error || 'Failed to get upload URL' 
            };
        }

        // Загружаем файл
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

    // Пакетная загрузка экспортированных файлов
    async uploadExports(exportResults, baseFolder = 'DeepSeek-Exports') {
        if (!exportResults || exportResults.length === 0) {
            return { success: false, error: 'No files to upload' };
        }

        const results = [];
        let successCount = 0;

        // Создаем необходимые папки
        const formats = [...new Set(exportResults.map(item => item.format))];
        for (const format of formats) {
            const folderPath = `${baseFolder}/${format.toUpperCase()}`;
            await this.createFolder(folderPath);
        }

        // Загружаем файлы
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
    }

    _getContentType(format) {
        const types = {
            'json': 'application/json',
            'txt': 'text/plain; charset=utf-8',
            'markdown': 'text/markdown; charset=utf-8',
            'doc': 'text/html', // Для DOC используем HTML
            'md': 'text/markdown; charset=utf-8'
        };
        return types[format] || 'text/plain';
    }

    // Получение информации о доступном месте
    async getDiskInfo() {
        const result = await this._request('/');
        if (result.success) {
            return {
                total: result.data.total_space,
                used: result.data.used_space,
                available: result.data.total_space - result.data.used_space,
                user: result.data.user
            };
        }
        return result;
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YandexDiskClient;
}