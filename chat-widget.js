document.addEventListener("DOMContentLoaded", function () {
  const chatOverlay = document.getElementById("chat-overlay");
  const initialState = document.getElementById("chat-initial-state");
  const initialChatInput = document.getElementById("initial-chat-input");
  const initialChatSendButton = document.getElementById("initial-chat-send-button");
  const chatWindow = document.getElementById("chat-window");
  const chatCloseButton = document.getElementById("chat-close-button");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const chatSendButton = document.getElementById("chat-send-button");
  const chatQuickReplies = document.getElementById("chat-quick-replies");

  let messageCounter = 0;
  const MESSAGELIMIT = 15;

  // SESSION ID генерация и хранение v2.1
  let sessionId = localStorage.getItem("chatSessionId");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("chatSessionId", sessionId);
  }
  window.chatSessionId = sessionId;

  // USER ID
  let userId = localStorage.getItem("chatUserId");
  if (!userId) {
    userId = "guest_" + crypto.randomUUID();
    localStorage.setItem("chatUserId", userId);
  }
  window.chatUserId = userId;

  console.log("🔒 Chat initialized:", { sessionId: window.chatSessionId, userId: window.chatUserId });

  // Быстрые ответы
  function updateQuickReplies(replies) {
    if (!chatQuickReplies) return;
    chatQuickReplies.innerHTML = "";
    replies.forEach(reply => {
      const button = document.createElement("button");
      button.classList.add("quick-reply-button");
      button.textContent = reply.title;
      button.onclick = () => handleSendMessage(reply.payload, true);
      chatQuickReplies.appendChild(button);
    });
  }

  // Основной вывод сообщений
  function addMessage(text, sender = "assistant", save = true) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", sender);

    // --- Фидбек UI приходящий от бэка
    if (typeof text === "string" && (text.includes('data-score="1"') || text.includes('data-score="-1"') || text.includes('data-score="0"'))) {
      messageDiv.innerHTML = text;
      const feedbackButtons = messageDiv.querySelectorAll('[data-score]');
      feedbackButtons.forEach(btn => {
        btn.onclick = function (e) {
          e.preventDefault();
          btn.disabled = true;
          btn.style.opacity = "0.5";
          const score = Number(btn.getAttribute("data-score"));
          const textarea = messageDiv.querySelector("#feedbackComment");
          const comment = textarea ? textarea.value.trim() : "";
          
          // КРИТИЧНО: Убедиться что sessionId есть и актуален перед отправкой фидбека
          const currentSessionId = localStorage.getItem("chatSessionId") || window.chatSessionId;
          console.log("📤 Отправка фидбека с sessionId:", currentSessionId);
          
          sendFeedback(score, comment, currentSessionId, messageDiv);
        };
      });
    } else {
      // Обычный текст/ответ
      const p = document.createElement("p");
      p.textContent = text;
      messageDiv.appendChild(p);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (save) saveChatHistory();
    return messageDiv;
  }

  // --- Сессия - КРИТИЧНО
  function setSessionId(newId) {
    console.log("🔄 SessionId обновлён:", newId);
    window.chatSessionId = newId;
    localStorage.setItem("chatSessionId", newId);
  }

  // --- Фидбек отправка на n8n - КРИТИЧНО: сохранение sessionId
  function sendFeedback(score, comment, sessionId, messageDiv) {
    // КРИТИЧНО: Убедиться что есть sessionId
    if (!sessionId) {
      sessionId = localStorage.getItem("chatSessionId") || window.chatSessionId;
      console.warn("⚠️ SessionId был null, восстановлен из localStorage:", sessionId);
    }

    if (!sessionId) {
      console.error("❌ КРИТИЧНО: SessionId всё ещё null!");
      alert("Ошибка: потеря сессии. Пожалуйста, перезагрузите страницу");
      return;
    }

    console.log("📤 Отправляем фидбек:", { score, comment, sessionId });

    fetch("https://auto.golubef.store/webhook/golubef-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: Number(score),
        comment: comment,
        sessionId: sessionId
      })
    })
    .then(res => res.json())
    .then(data => {
      console.log("✅ Фидбек отправлен успешно:", data);
      
      // КРИТИЧНО: Сохранить sessionId после успешной отправки фидбека
      localStorage.setItem("chatSessionId", sessionId);
      window.chatSessionId = sessionId;
      
      // Заменяем фидбек-блок на благодарность
      if (messageDiv) {
        messageDiv.innerHTML = `<div style="text-align:center;padding:20px;"><p style="color:#22c55e;font-weight:600;font-size:15px;">${data.message || "Спасибо за обратную связь!"}</p></div>`;
      }
      
      // КРИТИЧНО: После успешного фидбека, sessionId готов для следующего сообщения
      console.log("🔒 SessionId после фидбека (готов к использованию):", sessionId);
    })
    .catch(err => {
      console.error("❌ Feedback error:", err);
      // Разблокируем кнопки при ошибке
      if (messageDiv) {
        const btns = messageDiv.querySelectorAll('[data-score]');
        btns.forEach(b => { 
          b.disabled = false; 
          b.style.opacity = "1"; 
        });
      }
      alert("Ошибка отправки фидбека! Попробуйте позже.");
    });
  }

  // --- История
  function saveChatHistory() {
    const messages = [];
    chatMessages.querySelectorAll(".message").forEach(msgDiv => {
      if (!msgDiv.classList.contains("typing")) {
        messages.push({
          text: msgDiv.textContent,
          sender: msgDiv.classList.contains("user") ? "user"
                : msgDiv.classList.contains("system") ? "system"
                : "assistant"
        });
      }
    });
    localStorage.setItem("chatHistory", JSON.stringify(messages));
    localStorage.setItem("chatIsOpen", "true");
  }
  function loadChatHistory() {
    const history = JSON.parse(localStorage.getItem("chatHistory") || "[]");
    const isOpen = localStorage.getItem("chatIsOpen");
    if (isOpen && history.length > 0) {
      chatMessages.innerHTML = "";
      history.forEach(msg => addMessage(msg.text, msg.sender, false));
      openChat();
    }
  }

  // --- UI open/close
  function openChat() {
    initialState.style.display = "none";
    chatOverlay.classList.add("visible");
    chatWindow.classList.add("visible");
    if (chatInput) chatInput.focus();
  }
  function closeChat() {
    chatWindow.classList.remove("visible");
    chatOverlay.classList.remove("visible");
    initialState.style.display = "block";
    messageCounter = 0;
    localStorage.removeItem("chatIsOpen");
  }

  // --- Основная логика запроса к n8n - КРИТИЧНО: проверка sessionId
  async function sendMessageToN8n(userMessage) {
    // КРИТИЧНО: Убедиться что sessionId есть ДО отправки сообщения
    let currentSessionId = localStorage.getItem("chatSessionId");
    if (!currentSessionId) {
      currentSessionId = window.chatSessionId;
      localStorage.setItem("chatSessionId", currentSessionId);
      console.warn("⚠️ SessionId был потерян, восстановлен из window:", currentSessionId);
    }

    const n8nBackendUrl = "https://auto.golubef.store/webhook/golubef-ai";
    const authToken = window.GOLUBEFAIN8NTOKEN || "";
    const cleanUserId = window.chatUserId.startsWith('guest_') 
      ? window.chatUserId.substring(6) 
      : window.chatUserId;
    
    let payload = {
      sessionId: currentSessionId,
      userId: cleanUserId,
      message: userMessage,
    };

    console.log("📤 Отправка сообщения в n8n:", { sessionId: payload.sessionId, userId: payload.userId, message: userMessage });

    try {
      const response = await fetch(n8nBackendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + authToken
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("HTTP error! status: " + response.status);
      
      const responseData = await response.json();
      
      // КРИТИЧНО: Обновить sessionId если пришёл в ответе
      if (responseData.sessionId) {
        setSessionId(responseData.sessionId);
        console.log("✅ SessionId обновлён из ответа:", responseData.sessionId);
      }
      
      // КРИТИЧНО: Убедиться что sessionId сохранён перед возвратом ответа
      localStorage.setItem("chatSessionId", currentSessionId);
      
      return responseData;
    } catch (error) {
      console.error("❌ n8n error:", error);
      return { action: "error", response: "Ошибка! Не удалось отправить сообщение.", error };
    }
  }

  // --- handleSendMessage для чата/быстрых кнопок/всех сценариев
  async function handleSendMessage(messageText, isQuickReply = false) {
    if (!messageText.trim()) return;
    if (!chatWindow.classList.contains("visible")) openChat();
    if (messageCounter >= MESSAGELIMIT) {
      addMessage("Чат ограничен по количеству сообщений. Обновите страницу для нового диалога.", "system");
      return;
    }

    // КРИТИЧНО: Проверить sessionId перед отправкой
    const checkSessionId = localStorage.getItem("chatSessionId");
    if (!checkSessionId) {
      console.error("❌ КРИТИЧНО: SessionId потерян перед sendMessage! Line 93 ошибка!");
      const newSessionId = crypto.randomUUID();
      localStorage.setItem("chatSessionId", newSessionId);
      window.chatSessionId = newSessionId;
      console.log("⚠️ SessionId восстановлен:", newSessionId);
    }

    addMessage(messageText, "user");
    messageCounter++;
    if (chatInput) chatInput.value = "";
    if (initialChatInput) initialChatInput.value = "";

    const typingIndicator = addMessage("AI печатает...", "system");
    if (chatInput) chatInput.disabled = true;
    if (chatSendButton) chatSendButton.disabled = true;

    try {
      const n8nResponse = await sendMessageToN8n(messageText);
      if (typingIndicator) typingIndicator.remove();
      
      if (n8nResponse.action === "request_feedback") {
        // КРИТИЧНО: Обновить sessionId при запросе фидбека
        if (n8nResponse.sessionId) {
          setSessionId(n8nResponse.sessionId);
        }
        addMessage(n8nResponse.feedbackUI, "assistant", true);
      } else {
        addMessage(n8nResponse.response || "Нет ответа.", "assistant", true);
      }
      
      if (n8nResponse.quickreplies && n8nResponse.quickreplies.length > 0) {
        updateQuickReplies(n8nResponse.quickreplies);
      }
    } catch (error) {
      if (typingIndicator) typingIndicator.remove();
      console.error("❌ JS-ошибка:", error);
      addMessage("Ошибка отправки сообщения.", "system");
    } finally {
      if (chatInput) chatInput.disabled = false;
      if (chatSendButton) chatSendButton.disabled = false;
      if (chatInput) chatInput.focus();
    }
  }

  // --- Привязка событий
  if (chatCloseButton) chatCloseButton.addEventListener("click", closeChat);
  if (chatOverlay) chatOverlay.addEventListener("click", closeChat);
  if (initialChatSendButton) initialChatSendButton.addEventListener("click", () => handleSendMessage(initialChatInput.value));
  if (initialChatInput) initialChatInput.addEventListener("keypress", e => { if (e.key === "Enter") handleSendMessage(initialChatInput.value); });
  document.querySelectorAll(".quick-reply-chip").forEach(button => { button.addEventListener("click", () => handleSendMessage(button.textContent, true)); });
  if (chatSendButton) chatSendButton.addEventListener("click", () => handleSendMessage(chatInput.value));
  if (chatInput) chatInput.addEventListener("keypress", e => { if (e.key === "Enter") handleSendMessage(chatInput.value); });

  loadChatHistory();
});
