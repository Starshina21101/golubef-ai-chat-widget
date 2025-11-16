document.addEventListener('DOMContentLoaded', () => {
    // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
    const chatOverlay = document.getElementById('chat-overlay');
    const initialState = document.getElementById('chat-initial-state');
    const initialChatInput = document.getElementById('initial-chat-input');
    const initialChatSendButton = document.getElementById('initial-chat-send-button');
    
    const chatWindow = document.getElementById('chat-window');
    const chatCloseButton = document.getElementById('chat-close-button');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const chatQuickReplies = document.getElementById('chat-quick-replies');

    let messageCounter = 0;
    const MESSAGE_LIMIT = 15;

    // --- ЛОГИКА СОХРАНЕНИЯ ИСТОРИИ ---

    function saveChatHistory() {
        const messages = [];
        chatMessages.querySelectorAll('.message').forEach(msgDiv => {
            if (!msgDiv.classList.contains('typing')) { // Не сохраняем индикатор печати
                messages.push({
                    text: msgDiv.querySelector('p').textContent,
                    sender: msgDiv.classList.contains('user') ? 'user' : (msgDiv.classList.contains('system') ? 'system' : 'assistant')
                });
            }
        });
        localStorage.setItem('chatHistory', JSON.stringify(messages));
        localStorage.setItem('chatIsOpen', 'true');
    }

    function loadChatHistory() {
        const history = JSON.parse(localStorage.getItem('chatHistory'));
        const isOpen = localStorage.getItem('chatIsOpen') === 'true';

        if (isOpen && history && history.length > 0) {
            chatMessages.innerHTML = '';
            history.forEach(msg => addMessage(msg.text, msg.sender, false));
            openChat();
        }
    }

    // --- ОСНОВНЫЕ ФУНКЦИИ ЧАТА ---

    function addMessage(text, sender = 'assistant', save = true) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        
        if (sender === 'system' && text.includes('печатает')) {
            messageDiv.classList.add('typing');
        }

        const p = document.createElement('p');
        p.textContent = text;
        messageDiv.appendChild(p);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (save) {
            saveChatHistory();
        }
        return messageDiv;
    }

    function updateQuickReplies(replies = []) {
        chatQuickReplies.innerHTML = '';
        replies.forEach(reply => {
            const button = document.createElement('button');
            button.classList.add('quick-reply-button');
            button.textContent = reply.title;
            button.onclick = () => handleSendMessage(reply.payload, true);
            chatQuickReplies.appendChild(button);
        });
    }

    function openChat() {
        initialState.style.display = 'none';
        chatOverlay.classList.add('visible');
        chatWindow.classList.add('visible');
        chatInput.focus();
    }

    function closeChat() {
        chatWindow.classList.remove('visible');
        chatOverlay.classList.remove('visible');
        // Не показываем initialState, если чат был открыт
        // initialState.style.display = 'block'; 
        messageCounter = 0;
    }

    // --- ВЗАИМОДЕЙСТВИЕ С N8N ---

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

        const payload = { sessionId, userId, message: userMessage };

        try {
            const response = await fetch(n8nBackendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Ошибка при отправке сообщения в n8n:', error);
            return { action: 'error', response: 'Извините, произошла ошибка. Попробуйте позже.' };
        }
    }

    // --- ГЛАВНЫЙ ОБРАБОТЧИК ---

    async function handleSendMessage(messageText, isQuickReply = false) {
        if (!messageText.trim()) return;

        if (!chatWindow.classList.contains('visible')) {
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

        const typingIndicator = addMessage('AI печатает', 'system');
        chatInput.disabled = true;
        chatSendButton.disabled = true;

        try {
            const n8nResponse = await sendMessageToN8n(messageText);
            
            if (typingIndicator) typingIndicator.remove();

            if (n8nResponse.action === 'error') {
                addMessage(n8nResponse.response, 'system error');
            } else {
                const responseText = n8nResponse.response || "Я не совсем понял ваш вопрос. Можете перефразировать?";
                addMessage(responseText, 'assistant');
                if (n8nResponse.quick_replies && n8nResponse.quick_replies.length > 0) {
                    updateQuickReplies(n8nResponse.quick_replies);
                }
            }
        } catch (error) {
            if (typingIndicator) typingIndicator.remove();
            console.error("Ошибка в JS-логике виджета:", error);
            addMessage('Извините, произошла непредвиденная ошибка.', 'system error');
        } finally {
            chatInput.disabled = false;
            chatSendButton.disabled = false;
            chatInput.focus();
        }
    }

    // --- СЛУШАТЕЛИ СОБЫТИЙ ---

    chatCloseButton.addEventListener('click', closeChat);
    chatOverlay.addEventListener('click', closeChat);

    initialChatSendButton.addEventListener('click', () => handleSendMessage(initialChatInput.value));
    initialChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage(initialChatInput.value);
    });

    document.querySelectorAll('.quick-reply-chip').forEach(button => {
        button.addEventListener('click', () => handleSendMessage(button.textContent, true));
    });

    chatSendButton.addEventListener('click', () => handleSendMessage(chatInput.value));
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendMessage(chatInput.value);
    });

    // --- ИНИЦИАЛИЗАЦИЯ ---
    loadChatHistory();
});
