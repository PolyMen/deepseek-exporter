// page-actions.js - Модуль выполнения действий на странице DeepSeek

// Глобальная функция для экранирования HTML (для UI слайдера)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Модульные функции для работы со структурой DeepSeek

function extractChatTitle(record, chatId) {
    // Многоуровневый поиск заголовка как в рабочей версии slider.js
    let chatTitle = `Чат ${chatId.substring(0, 8)}`;

    if (record.data?.chat_session?.title && record.data.chat_session.title.trim() !== '') {
        chatTitle = record.data.chat_session.title;
    }
    else if (record.data?.chat_session?.chat_title && record.data.chat_session.chat_title.trim() !== '') {
        chatTitle = record.data.chat_session.chat_title;
    }
    else if (record.data?.title && record.data.title.trim() !== '') {
        chatTitle = record.data.title;
    }
    else if (record.title && record.title.trim() !== '') {
        chatTitle = record.title;
    }
    else {
        // Попробуем извлечь из первого пользовательского сообщения
        const messages = extractCompleteChatData(record);
        if (messages.length > 0) {
            const firstUserMessage = messages.find(msg => msg.role === 'user');
            if (firstUserMessage && firstUserMessage.content) {
                const content = firstUserMessage.content;
                chatTitle = content.substring(0, 50).split('\n')[0];
                if (chatTitle.length >= 50) {
                    chatTitle = chatTitle.substring(0, 47) + '...';
                }
            }
        }
    }

    return chatTitle;
}

function extractMessageRole(message, fragment) {
    // Приоритетная логика определения роли из рабочей версии
    let role = "user";
    
    if (fragment && fragment.role) {
        role = fragment.role.toLowerCase();
    } else if (message.role) {
        role = message.role.toLowerCase();
    } else if (fragment && fragment.content) {
        // Резервный анализ по содержанию
        const content = fragment.content;
        if (content.includes('assistant') || content.includes('AI') || content.includes('DeepSeek')) {
            role = "assistant";
        } else if (content.includes('user') || content.includes('пользователь')) {
            role = "user";
        }
    }
    
    return role;
}

function extractMessageContent(message) {
    // Многоуровневый поиск контента сообщения
    let content = "";

    // Основной путь: fragments -> content
    if (message.fragments && message.fragments.length > 0) {
        const fragment = message.fragments[0];
        if (fragment.content) {
            content = fragment.content;
        }
    }
    
    // Альтернативные пути
    if (!content && message.content) {
        content = message.content;
    }
    
    if (!content && message.data && message.data.content) {
        content = message.data.content;
    }

    return content || "";
}

function extractMessagesFromChatRecord(record) {
    // Извлечение сообщений из одной записи
    const messages = [];

    try {
        // Основная структура DeepSeek: data -> chat_messages
        if (record.data && record.data.chat_messages) {
            const chatMessages = record.data.chat_messages;

            for (const messageKey in chatMessages) {
                const message = chatMessages[messageKey];
                const fragment = message.fragments && message.fragments.length > 0 ? message.fragments[0] : null;
                
                const content = extractMessageContent(message);
                if (content) {
                    const role = extractMessageRole(message, fragment);
                    
                    messages.push({
                        id: message.id || messageKey,
                        role: role,
                        content: content,
                        timestamp: message.timestamp || (fragment ? fragment.timestamp : null) || record.timestamp || Date.now(),
                    });
                }
            }
        }

        // Альтернативная структура
        if (messages.length === 0 && record.data) {
            for (const key in record.data) {
                const item = record.data[key];
                if (item && typeof item === "object" && item.content) {
                    messages.push({
                        id: key,
                        role: item.role || "user",
                        content: item.content,
                        timestamp: item.timestamp || record.timestamp || Date.now(),
                    });
                }
            }
        }
    } catch (error) {
        // Ошибка извлечения сообщений
    }

    return messages;
}

function extractCompleteChatData(chatData) {
    // Главная функция - использует модульные помощники
    return extractMessagesFromChatRecord(chatData);
}

// Функции для форматирования сообщений assistant
function formatAssistantMessage(content) {
    if (!content) return '';
    
    let formatted = docEscapeHtml(content);
    
    // Обработка блоков кода ```
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
        return `<div class="code-block">${docEscapeHtml(code.trim())}</div>`;
    });
    
    // Обработка inline кода `
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Обработка переносов строк
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Оборачиваем в div для единого стиля
    formatted = `<div class="assistant-text">${formatted}</div>`;
    
    return formatted;
}

// Система сообщений - используется chrome.runtime.sendMessage для общения со слайдером
function sendProgress(percent, text) {
    chrome.runtime.sendMessage({
        action: 'progress',
        data: { percent, text }
    }).catch(() => {});
}

function sendStats(stats, filters) {
    chrome.runtime.sendMessage({
        action: 'stats', 
        data: { stats, filters }
    }).catch(() => {});
}

function sendChatsList(chats) {
    chrome.runtime.sendMessage({
        action: 'chatsList',
        data: { chats }
    }).catch(() => {});
}

function sendResult(result) {
    chrome.runtime.sendMessage({
        action: 'result',
        data: result
    }).catch(() => {});
}

// Вспомогательные функции
function saveFileStandard(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateFilename(baseName, extension, filters = null) {
    const timestamp = new Date().toISOString().split("T")[0];
    let filename = `deepseek-${baseName}-${timestamp}.${extension}`;

    if (filters && filters.searchText) {
        const searchSlug = filters.searchText
            .substring(0, 30)
            .replace(/[<>:"/\\|?*]/g, "") // Убираем только запрещенные символы в именах файлов
            .replace(/\s+/g, "-"); // Заменяем пробелы на дефисы
        
        const modeSlug = filters.filterMode === "whole-chat" ? "full" : "filtered";
        filename = `deepseek-${modeSlug}-${searchSlug}-${timestamp}.${extension}`;
    }

    return filename;
}

function getMessageTypeLabel(type) {
    const labels = {
        all: "Все сообщения",
        user: "Только пользователь", 
        assistant: "Только ассистент"
    };
    return labels[type] || type;
}

function matchesFilter(message, searchText, filters) {
    // Проверка типа сообщения
    if (filters.messageType !== "all") {
        // Приводим обе роли к нижнему регистру для сравнения
        const messageRole = message.role.toLowerCase();
        const filterRole = filters.messageType.toLowerCase();
        if (messageRole !== filterRole) {
            return false;
        }
    }

    // Проверка текста (только если есть поисковый запрос)
    if (filters.searchText && searchText) {
        const content = message.content || "";
        const contentToCheck = filters.caseSensitive ? content : content.toLowerCase();
        return contentToCheck.includes(searchText);
    }

    return true;
}

function filterChats(chats, filters) {
    if (!filters.searchText && filters.messageType === "all") {
        const totalMessages = chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
        return {
            chats: chats,
            stats: {
                originalChats: chats.length,
                originalMessages: totalMessages,
                filteredChats: chats.length,
                filteredMessages: totalMessages,
            },
        };
    }

    const searchText = filters.searchText ? (filters.caseSensitive ? filters.searchText : filters.searchText.toLowerCase()) : "";
    const filterMode = filters.filterMode || "whole-chat";

    let originalMessages = 0;
    let filteredMessages = 0;

    if (filterMode === "whole-chat") {
        // Режим 1: Фильтрация чатов (экспорт всего чата)
        const filteredChats = chats.filter((chat) => {
            originalMessages += chat.messages?.length || 0;

            if (chat.messages && chat.messages.length > 0) {
                const hasMatch = chat.messages.some((message) =>
                    matchesFilter(message, searchText, filters)
                );
                if (hasMatch) {
                    filteredMessages += chat.messages.length;
                    return true;
                }
            }
            return false;
        });

        return {
            chats: filteredChats,
            stats: {
                originalChats: chats.length,
                originalMessages: originalMessages,
                filteredChats: filteredChats.length,
                filteredMessages: filteredMessages,
            },
        };
    } else {
        // Режим 2: Фильтрация сообщений (только совпадающие)
        const filteredChats = chats
            .map((chat) => {
                originalMessages += chat.messages?.length || 0;

                // Создаем копию чата только с подходящими сообщениями
                const filteredChat = { ...chat };

                if (filteredChat.messages) {
                    filteredChat.messages = filteredChat.messages.filter((message) => {
                        const matches = matchesFilter(message, searchText, filters);
                        if (matches) filteredMessages++;
                        return matches;
                    });

                    // Добавляем метаданные фильтрации
                    filteredChat._filtered = true;
                    filteredChat._originalMessageCount = chat.messages.length;
                    filteredChat._filteredMessageCount = filteredChat.messages.length;
                }

                return filteredChat;
            })
            .filter((chat) => chat.messages && chat.messages.length > 0);

        return {
            chats: filteredChats,
            stats: {
                originalChats: chats.length,
                originalMessages: originalMessages,
                filteredChats: filteredChats.length,
                filteredMessages: filteredMessages,
            },
        };
    }
}

function sortChats(chats, sortOrder) {
    const sortedChats = [...chats];

    if (sortOrder === "newest-first") {
        return sortedChats.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
    } else {
        return sortedChats.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
    }
}

function getAllChatsFromStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("deepseek-chat");

        request.onsuccess = function (event) {
            const db = event.target.result;

            try {
                const transaction = db.transaction(["history-message"], "readonly");
                const store = transaction.objectStore("history-message");
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = function () {
                    const allRecords = getAllRequest.result;

                    const chats = [];
                    const chatMap = new Map();

                    allRecords.forEach((record) => {
                        try {
                            const chatId = record.chat_id || record.conversation_id || record.key;
                            const chatUrl = `https://chat.deepseek.com/a/chat/s/${chatId}`;

                            // Используем модульную функцию для заголовка
                            const chatTitle = extractChatTitle(record, chatId);
                            
                            // Используем модульную функцию для сообщений
                            const messages = extractCompleteChatData(record);

                            if (!chatMap.has(chatId)) {
                                chatMap.set(chatId, {
                                    id: chatId,
                                    title: chatTitle,
                                    url: chatUrl,
                                    createTime: record.create_time || record.timestamp || Date.now(),
                                    messages: messages,
                                });
                            }
                        } catch (error) {
                            // Ошибка обработки записи
                        }
                    });

                    chatMap.forEach((chat) => {
                        chat.messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                        chats.push(chat);
                    });

                    resolve(chats);
                };

                getAllRequest.onerror = function () {
                    reject(new Error("Не удалось загрузить данные из history-message"));
                };
            } catch (error) {
                reject(new Error(`Ошибка доступа к хранилищу: ${error.message}`));
            }
        };

        request.onerror = function () {
            reject(new Error("Не удалось открыть базу данных deepseek-chat"));
        };
    });
}

// Функции экспорта
async function exportToJSON(chats, exportType, filters, stats) {
    return new Promise((resolve, reject) => {
        try {
            const exportData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    type: exportType,
                    filters: filters,
                    stats: stats,
                    note: "Сообщения извлечены из структуры DeepSeek: history-message -> data -> chat_messages -> fragments -> content",
                },
                chats: chats,
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: "application/json",
            });

            const filename = generateFilename(exportType, "json", filters);
            saveFileStandard(filename, blob);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function exportToTxt(chats, exportType, filters, stats) {
    return new Promise((resolve, reject) => {
        try {
            let content = 'ЭКСПОРТ ЧАТОВ DEEPSEEK\n';
            content += '='.repeat(50) + '\n\n';
            
            content += `Дата экспорта: ${new Date().toLocaleString()}\n`;
            content += `Тип экспорта: ${exportType}\n\n`;

            if (filters && (filters.searchText || filters.messageType !== 'all')) {
                content += 'ПАРАМЕТРЫ ФИЛЬТРАЦИИ:\n';
                content += '-'.repeat(30) + '\n';
                content += `Режим: ${filters.filterMode === 'whole-chat' ? 'Весь чат' : 'Только сообщения'}\n`;
                content += `Поиск: "${filters.searchText || 'не задан'}"\n`;
                content += `Тип сообщений: ${getMessageTypeLabel(filters.messageType)}\n`;
                content += `Учет регистра: ${filters.caseSensitive ? 'Да' : 'Нет'}\n\n`;
            }

            content += 'СТАТИСТИКА ЭКСПОРТА:\n';
            content += '-'.repeat(30) + '\n';
            content += `Всего чатов: ${stats.filteredChats}\n`;
            content += `Всего сообщений: ${stats.filteredMessages}\n\n`;

            content += '='.repeat(50) + '\n\n';

            chats.forEach((chat, chatIndex) => {
                const chatTitle = chat.title || `Чат ${chatIndex + 1}`;
                const chatDate = chat.createTime ? new Date(chat.createTime).toLocaleString() : 'Дата неизвестна';
                const messageCount = chat.messages ? chat.messages.length : 0;
                
                content += `ЧАТ: ${chatTitle}\n`;
                content += '-'.repeat(40) + '\n';
                content += `Создан: ${chatDate}\n`;
                content += `Сообщений: ${messageCount}\n\n`;

                if (chat.messages && chat.messages.length > 0) {
                    chat.messages.forEach((message, msgIndex) => {
                        const role = message.role === 'user' ? '👤 ПОЛЬЗОВАТЕЛЬ:' : '🤖 DEEPSEEK:';
                        let messageContent = message.content || '(пустое сообщение)';
                        
                        content += `${role}\n`;
                        content += `${messageContent}\n\n`;
                        content += '―'.repeat(30) + '\n\n';
                    });
                }
                
                if (chatIndex < chats.length - 1) {
                    content += '📌'.repeat(20) + '\n\n';
                }
            });

            content += '='.repeat(50) + '\n';
            content += 'Конец документа\n';
            content += `Сгенерировано DeepSeek Exporter • ${new Date().toLocaleString()}\n`;

            const blob = new Blob([content], { 
                type: 'text/plain; charset=utf-8' 
            });
            
            const filename = generateFilename(exportType, "txt", filters);
            saveFileStandard(filename, blob);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function exportToMarkdown(chats, exportType, filters, stats) {
    return new Promise((resolve, reject) => {
        try {
            let markdownContent = `# Экспорт чатов DeepSeek\n\n`;
            markdownContent += `**Дата экспорта:** ${new Date().toLocaleString()}\n`;
            markdownContent += `**Тип экспорта:** ${exportType}\n`;

            if (filters) {
                markdownContent += `**Режим фильтрации:** ${filters.filterMode === "whole-chat" ? "Весь чат" : "Только сообщения"}\n`;
                markdownContent += `**Поисковый запрос:** "${filters.searchText}"\n`;
                markdownContent += `**Тип сообщений:** ${getMessageTypeLabel(filters.messageType)}\n`;
                markdownContent += `**Учет регистра:** ${filters.caseSensitive ? "Да" : "Нет"}\n`;
            }

            markdownContent += `**Статистика:** Чатов: ${stats.filteredChats} | Сообщений: ${stats.filteredMessages}\n\n`;
            markdownContent += `---\n\n`;

            chats.forEach((chat, chatIndex) => {
                const chatTitle = chat.title || `Чат ${chatIndex + 1}`;
                const chatDate = chat.createTime ? new Date(chat.createTime).toLocaleString() : "Дата неизвестна";
                const messageCount = chat.messages ? chat.messages.length : 0;

                markdownContent += `## ${chatTitle}\n\n`;
                markdownContent += `**Создан:** ${chatDate}  \n`;
                markdownContent += `**Сообщений:** ${messageCount}\n\n`;

                if (chat.messages && chat.messages.length > 0) {
                    chat.messages.forEach((message, msgIndex) => {
                        const role = message.role === "user" ? "👤 **ПОЛЬЗОВАТЕЛЬ**" : "🤖 **DEEPSEEK**";
                        let content = message.content || "(пустое сообщение)";
                        content = content.replace(/([*_`~\\])/g, "\\$1");

                        markdownContent += `### ${role}\n\n`;
                        markdownContent += `${content}\n\n`;
                        markdownContent += `---\n\n`;
                    });
                }

                markdownContent += `\\newpage\n\n`;
            });

            const blob = new Blob([markdownContent], {
                type: "text/markdown;charset=utf-8",
            });
            const filename = generateFilename(exportType, "md", filters);
            saveFileStandard(filename, blob);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Локальная функция для экранирования HTML в DOC экспорте
function docEscapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function exportToDoc(chats, exportType, filters, stats) {
    return new Promise((resolve, reject) => {
        try {
            let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            margin: 0 auto;
            padding: 20px;
            background: white;
            color: #1f2937;
            font-size: 14px;
            max-width: 900px;
        }
        .container {
            width: 100%;
            margin: 0 auto;
        }
        .header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e5e7eb;
            text-align: center;
        }
        .chat-section {
            margin-bottom: 40px;
            page-break-inside: avoid;
        }
        
        /* КОНТЕЙНЕРЫ СООБЩЕНИЙ */
        .message-container {
            margin: 20px 0;
            display: flex;
            align-items: flex-start;
            clear: both;
            width: 100%;
        }
        
        /* СООБЩЕНИЯ ПОЛЬЗОВАТЕЛЯ - справа */
        .user-message {
            justify-content: flex-end;
        }
        
        /* СООБЩЕНИЯ АССИСТЕНТА - слева */
        .assistant-message {
            justify-content: flex-start;
        }
        
        /* АВАТАРЫ */
        .message-avatar {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            text-align: center;
            line-height: 36px;
            font-size: 14px;
            font-weight: bold;
            flex-shrink: 0;
            margin: 0 12px;
        }
        .avatar-user {
            background: #10a37f;
            color: white;
        }
        .avatar-assistant {
            background: #6b7280;
            color: white;
        }
        
        /* БЛОКИ КОНТЕНТА */
        .message-content {
            position: relative;
            padding: 12px 16px;
            border-radius: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: inherit;
            text-align: left;
            max-width: 70%;
        }
        
        /* КОНТЕНТ ПОЛЬЗОВАТЕЛЯ - справа, ограниченной ширины */
        .content-user {
            background: #b7c8fe;
            color: #1f2937;
            border-bottom-right-radius: 4px;
        }
        
        /* КОНТЕНТ АССИСТЕНТА - слева, полная ширина */
        .content-assistant {
            background: transparent;
            color: #1f2937;
            border-bottom-left-radius: 4px;
            max-width: 85% !important;
            border-left: 3px solid #10a37f;
            padding-left: 20px;
            margin-left: 0;
        }
        
        /* ФОРМАТИРОВАНИЕ КОНТЕНТА АССИСТЕНТА */
        .assistant-text {
            font-family: inherit;
            line-height: 1.6;
        }
        .assistant-text p {
            margin: 12px 0;
        }
        .assistant-text ul, .assistant-text ol {
            margin: 12px 0;
            padding-left: 24px;
        }
        .assistant-text li {
            margin: 6px 0;
        }
        
        /* СТИЛИ ДЛЯ КОДА */
        .code-block {
            background: #f8f9fa;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 16px;
            margin: 12px 0;
            overflow-x: auto;
            font-family: 'Courier New', Monaco, Menlo, monospace;
            font-size: 13px;
            line-height: 1.4;
            color: #1f2937;
        }
        .inline-code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', Monaco, Menlo, monospace;
            font-size: 13px;
            color: #dc2626;
        }
        
        .metadata {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 20px;
            padding: 16px;
            background: #f9fafb;
            border-radius: 8px;
            border-left: 4px solid #10a37f;
        }
        .chat-header {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #e5e7eb;
        }
        .chat-title {
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
            text-decoration: none;
            display: block;
        }
        .chat-title:hover {
            text-decoration: underline;
        }
        .chat-link {
            font-size: 12px;
            color: #6b7280;
            word-break: break-all;
        }
        .separator {
            height: 1px;
            background: #e5e7eb;
            margin: 30px 0;
        }
        @media print {
            body { padding: 10px; }
            .chat-section { page-break-inside: avoid; }
            .message-container { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="font-size: 28px; margin-bottom: 12px; color: #10a37f;">Экспорт чатов DeepSeek</h1>
            <div class="metadata">
                <strong>Дата экспорта:</strong> ${new Date().toLocaleString()} • 
                <strong>Чатов:</strong> ${stats.filteredChats} • 
                <strong>Сообщений:</strong> ${stats.filteredMessages}
            </div>
            `;

            if (filters && (filters.searchText || filters.messageType !== 'all')) {
                htmlContent += `
            <div class="metadata">
                <strong>Параметры фильтрации:</strong><br>
                • Режим: ${filters.filterMode === 'whole-chat' ? 'Весь чат' : 'Только сообщения'}<br>
                • Поиск: "${filters.searchText || 'не задан'}"<br>
                • Тип сообщений: ${getMessageTypeLabel(filters.messageType)}<br>
                • Учет регистра: ${filters.caseSensitive ? 'Да' : 'Нет'}
            </div>
                `;
            }

            htmlContent += `
        </div>
            `;

            chats.forEach((chat, chatIndex) => {
                // Фильтруем сообщения
                const filteredMessages = (chat.messages || []).filter(message => 
                    message.content && 
                    !message.content.includes('The server is busy. Please try again later.') &&
                    !message.content.includes('Сервер перегружен')
                );

                if (filteredMessages.length === 0) return;

                const chatTitle = chat.title || `Чат ${chatIndex + 1}`;
                const chatDate = chat.createTime ? new Date(chat.createTime).toLocaleString() : 'Дата неизвестна';
                const chatUrl = chat.url || `https://chat.deepseek.com/chat/${chat.id}`;
                
                htmlContent += `
        <div class="chat-section">
            <div class="chat-header">
                <div>
                    <a href="${chatUrl}" target="_blank" class="chat-title">${docEscapeHtml(chatTitle)}</a>
                    <div class="chat-link">${chatUrl}</div>
                </div>
            </div>
            <div class="metadata">
                <strong>Создан:</strong> ${chatDate} • 
                <strong>Сообщений:</strong> ${filteredMessages.length}
            </div>
                `;

                filteredMessages.forEach((message) => {
                    const isUser = message.role === 'user';
                    const avatarClass = isUser ? 'avatar-user' : 'avatar-assistant';
                    const contentClass = isUser ? 'content-user' : 'content-assistant';
                    const messageClass = isUser ? 'user-message' : 'assistant-message';
                    const avatarSymbol = isUser ? 'U' : 'AI';
                    
                    let messageContent = message.content || '';
                    
                    if (isUser) {
                        messageContent = docEscapeHtml(messageContent).replace(/\n/g, '<br>');
                    } else {
                        messageContent = formatAssistantMessage(messageContent);
                    }
                    
                    // ИЗМЕНЕННЫЙ ПОРЯДОК HTML ЭЛЕМЕНТОВ
                    if (isUser) {
                        // Сообщение пользователя: контент слева, аватар справа
                        htmlContent += `
            <div class="message-container ${messageClass}">
                <div class="message-avatar ${avatarClass}">${avatarSymbol}</div>
                <div class="message-content ${contentClass}">${messageContent}</div>
            </div>
                        `;
                    } else {
                        // Сообщение ассистента: аватар слева, контент справа
                        htmlContent += `
            <div class="message-container ${messageClass}">
                <div class="message-avatar ${avatarClass}">${avatarSymbol}</div>
                <div class="message-content ${contentClass}">${messageContent}</div>
            </div>
                        `;
                    }
                });

                htmlContent += `
        </div>
                `;
                
                if (chatIndex < chats.length - 1) {
                    htmlContent += `
        <div class="separator"></div>
                    `;
                }
            });

            htmlContent += `
    </div>
</body>
</html>
            `;

            const blob = new Blob([htmlContent], { 
                type: 'application/msword' 
            });
            
            const filename = generateFilename(exportType, "doc", filters);
            saveFileStandard(filename, blob);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

// Основные функции действий
const functions = {
    exploreDatabase: () => {
        return new Promise((resolve) => {
            sendProgress(20, "Открываем базу данных...");

            const request = indexedDB.open("deepseek-chat");

            request.onsuccess = function (event) {
                const db = event.target.result;
                const objectStoreNames = Array.from(db.objectStoreNames);

                if (objectStoreNames.length === 0) {
                    resolve("❌ Хранилища не найдены");
                    return;
                }

                let result = "🔍 Результат исследования базы данных:\n\n";
                result += "📂 Найдены хранилища: " + objectStoreNames.join(", ") + "\n\n";

                if (objectStoreNames.includes("history-message")) {
                    result += "🎯 **Основное хранилище: history-message**\n";

                    try {
                        const transaction = db.transaction(["history-message"], "readonly");
                        const store = transaction.objectStore("history-message");
                        const countRequest = store.count();

                        countRequest.onsuccess = function () {
                            const count = countRequest.result;
                            result += `📁 Записей в history-message: ${count}\n`;

                            const sampleRequest = store.getAll(IDBKeyRange.lowerBound(0), 1);
                            sampleRequest.onsuccess = function () {
                                const sample = sampleRequest.result[0];
                                if (sample) {
                                    result += "📋 Структура записи:\n";
                                    result += `• Ключи: ${Object.keys(sample).join(", ")}\n`;

                                    if (sample.data) {
                                        result += `• data: ${Object.keys(sample.data).join(", ")}\n`;

                                        if (sample.data.chat_messages) {
                                            const messageCount = Object.keys(sample.data.chat_messages).length;
                                            result += `• chat_messages: ${messageCount} сообщений\n`;
                                        }
                                    }

                                    const messages = extractCompleteChatData(sample);
                                    result += `• извлечено сообщений: ${messages.length}\n`;

                                    if (messages.length > 0) {
                                        result += `• пример: "${messages[0].content.substring(0, 50)}..."\n`;
                                    }
                                }

                                sendProgress(100, "Исследование завершено!");
                                resolve(result);
                            };
                        };
                    } catch (error) {
                        result += `❌ Ошибка анализа: ${error.message}\n`;
                        sendProgress(100, "Исследование завершено!");
                        resolve(result);
                    }
                }

                sendProgress(100, "Исследование завершено!");
                resolve(result);
            };

            request.onerror = function (event) {
                resolve("❌ Не удалось открыть базу данных deepseek-chat");
            };
        });
    },

    findStores: () => {
        return new Promise((resolve) => {
            const request = indexedDB.open("deepseek-chat");

            request.onsuccess = function (event) {
                const db = event.target.result;
                const objectStoreNames = Array.from(db.objectStoreNames);

                if (objectStoreNames.length === 0) {
                    resolve("❌ Хранилища не найдены");
                    return;
                }

                let result = `📂 Найдено хранилищ в deepseek-chat: ${objectStoreNames.length}\n\n`;
                objectStoreNames.forEach((name, index) => {
                    result += `${index + 1}. ${name}\n`;
                    if (name === "history-message") {
                        result += `   🎯 **Основное хранилище сообщений**\n`;
                    }
                });

                resolve(result);
            };

            request.onerror = function () {
                resolve("❌ Не удалось открыть базу данных deepseek-chat");
            };
        });
    },

    testFilter: (data) => {
        return new Promise((resolve) => {
            sendProgress(30, "Загружаем данные для теста...");

            getAllChatsFromStorage()
                .then((allChats) => {
                    sendProgress(70, "Применяем фильтры...");
                    const filterResult = filterChats(allChats, data.filters);

                    sendProgress(90, "Формируем отчет...");

                    sendChatsList(filterResult.chats);

                    let result = `🧪 Результаты теста фильтра:\n\n`;
                    result += `📊 Всего чатов: ${allChats.length}\n`;
                    result += `💬 Всего сообщений: ${filterResult.stats.originalMessages}\n`;

                    if (data.filters.filterMode === "whole-chat") {
                        result += `🔍 Найдено чатов: ${filterResult.chats.length}\n`;
                        result += `📈 Охват: ${((filterResult.chats.length / allChats.length) * 100).toFixed(1)}%\n\n`;
                    } else {
                        result += `🔍 Найдено сообщений: ${filterResult.stats.filteredMessages}\n`;
                        result += `📈 Охват: ${((filterResult.stats.filteredMessages / filterResult.stats.originalMessages) * 100).toFixed(1)}%\n\n`;
                    }

                    if (filterResult.chats.length > 0) {
                        result += `📋 Найдено ${filterResult.chats.length} чатов\n`;
                        result += `✅ Список чатов загружен в интерфейс - выберите нужные для экспорта\n`;
                    } else {
                        result += `❌ Ничего не найдено. Попробуйте изменить параметры поиска.\n`;
                    }

                    sendProgress(100, "Тест завершен!");
                    sendStats(filterResult.stats, data.filters);
                    resolve(result);
                })
                .catch((error) => {
                    resolve(`❌ Ошибка загрузки данных: ${error.message}`);
                });
        });
    },

    checkModuleAvailability: () => {
        console.log('🔍 checkModuleAvailability вызван в page-actions.js');
        const result = `CloudSyncManager: ${typeof CloudSyncManager}, window: ${typeof window.CloudSyncManager}, RealYandexDiskClient: ${typeof RealYandexDiskClient}`;
        console.log('📊 Результат:', result);
        sendResult(result); // ← ДОБАВИТЬ ЭТУ СТРОКУ
        return Promise.resolve(result);
    },

    testModuleIntegration: () => {
        console.log('🔧 testModuleIntegration вызван в page-actions.js');
        let result;
        
        if (typeof window.syncManager !== 'undefined') {
            console.log('✅ window.syncManager доступен:', typeof window.syncManager);
            const status = window.syncManager.getSyncStatus();
            result = '✅ SyncManager работает. Статус: ' + JSON.stringify(status);
        } else if (typeof CloudSyncManager !== 'undefined') {
            console.log('✅ CloudSyncManager доступен, создаем экземпляр');
            const instance = new CloudSyncManager();
            result = '✅ Модуль работает: ' + typeof instance;
        } else {
            console.log('❌ Ни один менеджер не доступен');
            result = '❌ Модуль не доступен';
        }
        
        console.log('📊 Результат:', result);
        sendResult(result);
        return Promise.resolve(result);
    },

    exportChats: (options = {}) => {
        return new Promise((resolve) => {
            sendProgress(20, "Загружаем данные из history-message...");

            getAllChatsFromStorage()
                .then((allChats) => {
                    sendProgress(60, "Обрабатываем данные...");

                    let chatsToExport = allChats;
                    let exportStats = {
                        originalChats: allChats.length,
                        originalMessages: allChats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0),
                        filteredChats: 0,
                        filteredMessages: 0,
                    };

                    // Применяем фильтры если нужно
                    if (options.type === "filtered" && options.filters) {
                        const filterResult = filterChats(allChats, options.filters);
                        chatsToExport = filterResult.chats;
                        exportStats.filteredChats = filterResult.stats.filteredChats;
                        exportStats.filteredMessages = filterResult.stats.filteredMessages;

                        // Если есть выбранные ID чатов, фильтруем по ним
                        if (options.selectedChatIds && options.selectedChatIds.length > 0) {
                            chatsToExport = chatsToExport.filter(chat => 
                                options.selectedChatIds.includes(chat.id)
                            );
                            exportStats.filteredChats = chatsToExport.length;
                            exportStats.filteredMessages = chatsToExport.reduce(
                                (sum, chat) => sum + (chat.messages?.length || 0), 0
                            );
                        }
                    } else if (options.type === "recent") {
                        chatsToExport = allChats
                            .sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
                            .slice(0, options.limit || 10);
                        exportStats.filteredChats = chatsToExport.length;
                        exportStats.filteredMessages = chatsToExport.reduce(
                            (sum, chat) => sum + (chat.messages?.length || 0), 0
                        );
                    } else {
                        exportStats.filteredChats = chatsToExport.length;
                    }

                    // Применяем сортировку
                    if (options.filters && options.filters.sortOrder) {
                        chatsToExport = sortChats(chatsToExport, options.filters.sortOrder);
                    }

                    if (chatsToExport.length === 0) {
                        resolve("❌ Нет чатов для экспорта");
                        return;
                    }

                    sendProgress(80, "Формируем файлы...");
                    sendStats(exportStats, options.filters);

                    // Экспорт в выбранных форматах
                    const exportPromises = [];

                    if (options.formats.includes("json")) {
                        exportPromises.push(
                            exportToJSON(chatsToExport, options.type, options.filters, exportStats)
                        );
                    }

                    if (options.formats.includes("txt")) {
                        exportPromises.push(
                            exportToTxt(chatsToExport, options.type, options.filters, exportStats)
                        );
                    }

                    if (options.formats.includes("markdown")) {
                        exportPromises.push(
                            exportToMarkdown(chatsToExport, options.type, options.filters, exportStats)
                        );
                    }

                    if (options.formats.includes("doc")) {
                        exportPromises.push(
                            exportToDoc(chatsToExport, options.type, options.filters, exportStats)
                        );
                    }

                    Promise.all(exportPromises)
                        .then(() => {
                            sendProgress(100, "Экспорт завершен!");
                            let successMsg = `✅ Успешно экспортировано ${chatsToExport.length} чатов (${exportStats.filteredMessages} сообщений) в форматы: ${options.formats.join(", ")}`;
                            if (options.filters && options.filters.searchText) {
                                if (options.filters.filterMode === "whole-chat") {
                                    successMsg += `\n📊 Найдено чатов: ${exportStats.filteredChats} из ${exportStats.originalChats}`;
                                } else {
                                    successMsg += `\n📊 Сообщений: ${exportStats.filteredMessages} из ${exportStats.originalMessages}`;
                                }
                            }
                            if (options.selectedChatIds && options.selectedChatIds.length > 0) {
                                successMsg += `\n🎯 Экспортировано выбранных чатов: ${options.selectedChatIds.length}`;
                            }
                            resolve(successMsg);
                        })
                        .catch((error) => resolve(`❌ Ошибка экспорта: ${error.message}`));
                })
                .catch((error) => {
                    resolve(`❌ Ошибка загрузки данных: ${error.message}`);
                });
        });
    }
};

// Главная функция выполнения действий
function executeActionInPage(request) {
    if (functions[request.action]) {
        functions[request.action](request.data)
            .then((result) => {
                sendResult(result);
            })
            .catch((error) => {
                sendResult(`❌ Ошибка выполнения: ${error.message}`);
            });
    } else {
        sendResult(`❌ Неизвестное действие: ${request.action}`);
    }
}