document.addEventListener('DOMContentLoaded', () => {
    // Глобальные переменные
    const chatContainer = document.getElementById('golubef-ai-chat-container');
    const initialState = document.getElementById('chat-initial-state');
    const initialChatInput = document.getElementById('initial-chat-input');
    const initialChatSendButton = document.getElementById('initial-chat-send-button');
    const initialQuickReplies = document.getElementById('initial-quick-replies');

    const chatWindow = document.getElementById('chat-window');
    const chatCloseButton = document.getElementById('chat-close-button');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const chatQuickReplies = document.getElementById('chat-quick-replies');

    let messageCounter = 0; // Счетчик сообщений для ограничения
    const MESSAGE_LIMIT = 15; // Лимит сообщений на сессию

    // Функция для добавления сообщения в чат
    function addMessage(text, sender = 'assistant') {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        const p = document.createElement('p');
        p.textContent = text;
        messageDiv.appendChild(p);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Прокрутка вниз
    }

    // Функция для очистки и добавления быстрых ответов
    function updateQuickReplies(replies = []) {
        chatQuickReplies.innerHTML = ''; // Очищаем старые
        replies.forEach(reply => {
            const button = document.createElement('button');
            button.classList.add('quick-reply-button');
            button.textContent = reply.title;
            button.onclick = () => {
                // Отправляем payload как сообщение
                handleSendMessage(reply.payload, true); // true означает, что это быстрый ответ
            };
            chatQuickReplies.appendChild(button);
        });
    }

    // Функция для открытия и инициализации чата
    function openChat() {
        initialState.style.display = 'none'; // Скрываем начальное состояние
        chatWindow.classList.remove('hidden');
        chatInput.focus();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Обработчик кнопки закрытия
    chatCloseButton.addEventListener('click', () => {
        chatWindow.classList.add('hidden');
        initialState.style.display = 'block'; // Показываем начальное состояние снова
        messageCounter = 0; // Сбрасываем счетчик при закрытии
    });

    // Функция отправки сообщения на n8n
    async function sendMessageToN8n(userMessage) {
        const n8nBackendUrl = 'https://auto.golubef.store/webhook/golubef-ai';
        const authToken = window.GOLUBEF_AI_N8N_TOKEN; // Получаем токен из глобальной переменной

        let sessionId = localStorage.getItem('chatSessionId');
        if (!sessionId) {
            sessionId = crypto.randomUUID(); // Генерируем уникальный ID сессии
            localStorage.setItem('chatSessionId', sessionId);
        }

        let userId = localStorage.getItem('chatUserId');
        if (!userId) {
            userId = `guest_${crypto.randomUUID()}`; // Генерируем уникальный ID гостя
            localStorage.setItem('chatUserId', userId);
        }

        const payload = {
            sessionId: sessionId,
            userId: userId,
            message: userMessage
        };

        try {
            const response = await fetch(n8nBackendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data; // Возвращаем JSON-объект с action, response, quick_replies
        } catch (error) {
            console.error('Ошибка при отправке сообщения в n8n:', error);
            // Возвращаем объект ошибки для фронтенда
            return { action: 'error', response: 'Извините, произошла ошибка. Попробуйте позже.' };
        }
    }

    // Обработчик отправки сообщения
    async function handleSendMessage(messageText, isQuickReply = false) {
        if (!messageText.trim()) return;

        // Если это первое сообщение, открываем чат
        if (chatWindow.classList.contains('hidden')) {
            openChat();
        }

        // Проверяем лимит сообщений
        if (messageCounter >= MESSAGE_LIMIT) {
            addMessage('Кажется, у вас сложный вопрос. Давайте я позову эксперта, он скоро с вами свяжется.', 'system');
            return;
        }

        addMessage(messageText, 'user');
        messageCounter++; // Увеличиваем счетчик после сообщения пользователя
        chatInput.value = '';
        initialChatInput.value = '';

        // Показываем индикатор печати AI и блокируем ввод
        const typingIndicator = addMessage('AI печатает...', 'system');
        chatInput.disabled = true;
        chatSendButton.disabled = true;
        updateQuickReplies(); // Скрываем быстрые ответы после отправки

        try {
            const n8nResponse = await sendMessageToN8n(messageText);

            // Удаляем индикатор печати
            typingIndicator.remove();

            if (n8nResponse.action === 'error') {
                addMessage(n8nResponse.response, 'system error');
            } else {
                addMessage(n8nResponse.response, 'assistant');
                if (n8nResponse.quick_replies && n8nResponse.quick_replies.length > 0) {
                    updateQuickReplies(n8nResponse.quick_replies);
                } else {
                    updateQuickReplies(); // Очистить, если нет новых
                }

                if (n8nResponse.action === 'human_handoff') {
                    // Возможно, показать дополнительное UI
                } else if (n8nResponse.action === 'lead_capture') {
                    // Возможно, показать форму лидогенерации
                }
            }
        } catch (error) {
            typingIndicator.remove();
            console.error("Ошибка в JS-логике виджета:", error);
            addMessage('Извините, произошла непредвиденная ошибка.', 'system error');
        } finally {
            chatInput.disabled = false;
            chatSendButton.disabled = false;
            chatInput.focus();
        }
    }

    // Обработчики для нового начального состояния
    initialChatSendButton.addEventListener('click', () => {
        handleSendMessage(initialChatInput.value);
    });

    initialChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage(initialChatInput.value);
        }
    });

    document.querySelectorAll('.quick-reply-chip').forEach(button => {
        button.addEventListener('click', () => {
            handleSendMessage(button.textContent, true);
        });
    });

    // Обработчики для окна чата
    chatSendButton.addEventListener('click', () => {
        handleSendMessage(chatInput.value);
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage(chatInput.value);
        }
    });
});
