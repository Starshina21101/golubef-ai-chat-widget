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

    let messageCounter = 0;
    const MESSAGE_LIMIT = 15;

    // Функция для добавления сообщения в чат
    function addMessage(text, sender = 'assistant') {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        const p = document.createElement('p');
        p.textContent = text;
        messageDiv.appendChild(p);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }

    // Функция для быстрых ответов
    function updateQuickReplies(replies = []) {
        chatQuickReplies.innerHTML = '';
        replies.forEach(reply => {
            const button = document.createElement('button');
            button.classList.add('quick-reply-button');
            button.textContent = reply.title;
            button.onclick = () => {
                handleSendMessage(reply.payload, true);
            };
            chatQuickReplies.appendChild(button);
        });
    }

    // Открытие чата
    function openChat() {
        initialState.style.display = 'none';
        chatWindow.classList.remove('hidden');
        chatInput.focus();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Закрытие чата
    chatCloseButton.addEventListener('click', () => {
        chatWindow.classList.add('hidden');
        initialState.style.display = 'block';
        messageCounter = 0;
    });

    // Отправка сообщения в n8n
    async function sendMessageToN8n(userMessage) {
        const n8nBackendUrl = 'https://auto.golubef.store/webhook/golubef-ai';
        const authToken = window.GOLUBEF_AI_N8N_TOKEN;

        let sessionId = localStorage.getItem('chatSessionId');
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            localStorage.setItem('chatSessionId', sessionId);
        }

        let userId = localStorage.getItem('chatUserId');
        if (!userId) {
            userId = `guest_${crypto.randomUUID()}`;
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
            
            return await response.json();
        } catch (error) {
            console.error('Ошибка при отправке сообщения в n8n:', error);
            return { action: 'error', response: 'Извините, произошла ошибка. Попробуйте позже.' };
        }
    }

    // Основной обработчик отправки сообщений
    async function handleSendMessage(messageText, isQuickReply = false) {
        if (!messageText.trim()) return;

        if (chatWindow.classList.contains('hidden')) {
            openChat();
        }

        if (messageCounter >= MESSAGE_LIMIT) {
            addMessage('Кажется, у вас сложный вопрос. Давайте я позову эксперта, он скоро с вами свяжется.', 'system');
            return;
        }

        addMessage(messageText, 'user');
        messageCounter++;
        chatInput.value = '';
        initialChatInput.value = '';

        const typingIndicator = addMessage('AI печатает...', 'system');
        chatInput.disabled = true;
        chatSendButton.disabled = true;
        updateQuickReplies();

        try {
            const n8nResponse = await sendMessageToN8n(messageText);

            if (typingIndicator) {
                typingIndicator.remove();
            }

            if (n8nResponse.action === 'error') {
                addMessage(n8nResponse.response, 'system error');
            } else {
                const responseText = n8nResponse.response || "Я не совсем понял ваш вопрос. Можете перефразировать?";
                addMessage(responseText, 'assistant');
                if (n8nResponse.quick_replies && n8nResponse.quick_replies.length > 0) {
                    updateQuickReplies(n8nResponse.quick_replies);
                } else {
                    updateQuickReplies();
                }
            }
        } catch (error) {
            if (typingIndicator) {
                typingIndicator.remove();
            }
            console.error("Ошибка в JS-логике виджета:", error);
            addMessage('Извините, произошла непредвиденная ошибка.', 'system error');
        } finally {
            chatInput.disabled = false;
            chatSendButton.disabled = false;
            chatInput.focus();
        }
    }

    // Слушатели событий
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

    chatSendButton.addEventListener('click', () => {
        handleSendMessage(chatInput.value);
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage(chatInput.value);
        }
    });
});
