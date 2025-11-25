document.addEventListener("DOMContentLoaded", function () {
  // ... (твой существующий код констант и инициализации)
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

  // SESSION ID генерация и хранение
  let sessionId = localStorage.getItem("chatSessionId");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("chatSessionId", sessionId);
  }
  window.chatSessionId = sessionId;

  // USER ID
  let userId = localStorage.getItem("chatUserId");
  if (!userId) {
    userId = "guest-" + crypto.randomUUID();
    localStorage.setItem("chatUserId", userId);
  }
  window.chatUserId = userId;

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

  function addMessage(text, sender = "assistant", save = true) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", sender);

    // Интеграция фидбека
    if (typeof text === "string" && text.includes('data-score="1"')) {
      messageDiv.innerHTML = text;
      // Обработчики для фидбек-кнопок
      messageDiv.querySelectorAll('button[data-score]').forEach(btn => {
        btn.onclick = function () {
          btn.disabled = true;
          btn.style.opacity = "0.6";
          const score = Number(btn.getAttribute("data-score"));
          const comment = messageDiv.querySelector("#feedbackComment") ? messageDiv.querySelector("#feedbackComment").value : "";
          sendFeedback(score, comment, window.chatSessionId);
        };
      });
    } else {
      const p = document.createElement("p");
      p.textContent = text;
      messageDiv.appendChild(p);
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (save) saveChatHistory();
    return messageDiv;
  }

  function setSessionId(newId) {
    window.chatSessionId = newId;
    localStorage.setItem("chatSessionId", newId);
  }

  function sendFeedback(score, comment, sessionId) {
    if (!sessionId) sessionId = window.chatSessionId;
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
        const successHtml = `<div style="text-align:center;padding:20px;"><p style="color:#22c55e;font-weight:600;">${data.message || "Спасибо за обратную связь!"}</p></div>`;
        displayFeedbackSuccess(successHtml);
    })
    .catch(err => {
        displayFeedbackError("Ошибка отправки фидбека! Попробуйте позже.");
        console.error("Feedback error:", err);
    });
  }

  function displayFeedbackSuccess(html) {
    // ищем ближайший блок feedbackUI
    const feedbackDiv = document.querySelector('[data-score="1"]').closest("div");
    if (feedbackDiv) feedbackDiv.innerHTML = html;
  }
  function displayFeedbackError(msg) {
    const feedbackDiv = document.querySelector('[data-score="1"]').closest("div");
    if (feedbackDiv) feedbackDiv.innerHTML = `<p style="color:#ef4444;font-weight:600;">${msg}</p>`;
  }

  // ... (остальной твой код: updateQuickReplies, openChat, closeChat, и т.п.)

  async function sendMessageToN8n(userMessage) {
    const n8nBackendUrl = "https://auto.golubef.store/webhook/golubef-ai";
    const authToken = window.GOLUBEFAIN8NTOKEN || "";
    let payload = {
      sessionId: window.chatSessionId,
      userId: window.chatUserId,
      message: userMessage,
    };
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
      return await response.json();
    } catch (error) {
      console.error("n8n", error);
      return { action: "error", response: "Ошибка! Не удалось отправить сообщение.", error };
    }
  }

  async function handleSendMessage(messageText, isQuickReply = false) {
    if (!messageText.trim()) return;
    if (!chatWindow.classList.contains("visible")) openChat();
    if (messageCounter >= MESSAGELIMIT) {
      addMessage("Чат ограничен по количеству сообщений. Обновите страницу для нового диалога.", "system");
      return;
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
      // Фронт для action request_feedback
      if (n8nResponse.action === "request_feedback") {
        setSessionId(n8nResponse.sessionId);
        addMessage(n8nResponse.feedbackUI, "assistant", true);
      } else {
        addMessage(n8nResponse.response || "Нет ответа.", "assistant", true);
      }
      if (n8nResponse.quickreplies && n8nResponse.quickreplies.length > 0) {
        updateQuickReplies(n8nResponse.quickreplies);
      }
    } catch (error) {
      if (typingIndicator) typingIndicator.remove();
      console.error("JS-ошибка:", error);
      addMessage("Ошибка отправки сообщения.", "system");
    } finally {
      if (chatInput) chatInput.disabled = false;
      if (chatSendButton) chatSendButton.disabled = false;
      if (chatInput) chatInput.focus();
    }
  }

  // ... (твои обработчики для кнопок, открытия/закрытия и другие вспомогательные функции)

  loadChatHistory();
});
