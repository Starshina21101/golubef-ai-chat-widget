document.addEventListener("DOMContentLoaded", function () {
  const chatOverlay = document.getElementById("chat-overlay");
  const initialState = document.getElementById("chat-initial-state");
  const initialChatInput = document.getElementById("initial-chat-input");
  const initialChatSendButton = document.getElementById("initial-chat-send-button");
  const chatWindow = document.getElementById("chat-window");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const chatSendButton = document.getElementById("chat-send-button");
  const chatQuickReplies = document.getElementById("chat-quick-replies");
  const chatCloseButton = document.getElementById("chat-close-button");

  // Элементы статуса (добавлены в верстку окна)
  const chatStatusMessage = document.getElementById("chat-status-message");
  const chatProgressBar = document.getElementById("chat-progress-bar");

  let messageCounter = 0;
  const MESSAGELIMIT = 15;

  // ===== TIMESTAMP =====
function formatTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

  // ===== SESSION ID v2.5 =====
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

  // ===== Основной вывод сообщений (с timestamp) =====
  function addMessage(text, sender = "assistant", save = true, withTimestamp = true) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", sender);

    // Фидбек-HTML от бэка
    if (
      typeof text === "string" &&
      (text.includes('data-score="1"') ||
        text.includes('data-score="-1"') ||
        text.includes('data-score="0"'))
    ) {
      messageDiv.innerHTML = text;
      const feedbackButtons = messageDiv.querySelectorAll("[data-score]");
      feedbackButtons.forEach(btn => {
        btn.onclick = function (e) {
          e.preventDefault();
          btn.disabled = true;
          btn.style.opacity = "0.5";
          const score = Number(btn.getAttribute("data-score"));
          const textarea = messageDiv.querySelector("#feedbackComment");
          const comment = textarea ? textarea.value.trim() : "";
          const currentSessionId =
            localStorage.getItem("chatSessionId") || window.chatSessionId;
          sendFeedback(score, comment, currentSessionId, messageDiv);
        };
      });
    } else {
      const p = document.createElement("p");
      p.textContent = text;
      messageDiv.appendChild(p);
    }

    // timestamp (не для typing)
    if (withTimestamp && !messageDiv.classList.contains("typing")) {
      const ts = document.createElement("div");
      ts.classList.add("message-timestamp");
      ts.textContent = formatTimestamp(new Date());
      messageDiv.appendChild(ts);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (save) saveChatHistory();
    return messageDiv;
  }

  // ===== Индикатор печати (3 точки) =====
  function showTypingIndicator() {
    const typingDiv = document.createElement("div");
    typingDiv.classList.add("message", "system", "typing");

    const wrapper = document.createElement("div");
    wrapper.classList.add("typing-indicator");

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.classList.add("typing-dot");
      wrapper.appendChild(dot);
    }

    typingDiv.appendChild(wrapper);
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return typingDiv;
  }

  function removeTypingIndicator(typingDiv) {
    if (typingDiv && typingDiv.parentNode) {
      typingDiv.parentNode.removeChild(typingDiv);
    }
  }

  // ===== Сессия =====
  function setSessionId(newId) {
    window.chatSessionId = newId;
    localStorage.setItem("chatSessionId", newId);
  }

  // ===== Фидбек в n8n =====
  function sendFeedback(score, comment, sessionId, messageDiv) {
    if (!sessionId) {
      sessionId = localStorage.getItem("chatSessionId") || window.chatSessionId;
    }
    if (!sessionId) {
      alert("Ошибка: потеря сессии. Пожалуйста, перезагрузите страницу");
      return;
    }

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
        localStorage.setItem("chatSessionId", sessionId);
        window.chatSessionId = sessionId;

        if (messageDiv) {
          messageDiv.innerHTML = `<div style="text-align:center;padding:20px;"><p style="color:#22c55e;font-weight:600;font-size:15px;">${
            data.message || "Спасибо за обратную связь!"
          }</p></div>`;
        }
      })
      .catch(err => {
        if (messageDiv) {
          const btns = messageDiv.querySelectorAll("[data-score]");
          btns.forEach(b => {
            b.disabled = false;
            b.style.opacity = "1";
          });
        }
        alert("Ошибка отправки фидбека! Попробуйте позже.");
      });
  }

  // ===== История =====
  function saveChatHistory() {
    const messages = [];
    chatMessages.querySelectorAll(".message").forEach(msgDiv => {
      if (!msgDiv.classList.contains("typing")) {
        messages.push({
          text: msgDiv.textContent,
          sender: msgDiv.classList.contains("user")
            ? "user"
            : msgDiv.classList.contains("system")
            ? "system"
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
      history.forEach(msg => addMessage(msg.text, msg.sender, false, false));
      openChat();
    }
  }

  // ===== UI open/close =====
  function openChat() {
    if (initialState) initialState.style.display = "none";
    if (chatOverlay) chatOverlay.classList.add("visible");
    if (chatWindow) chatWindow.classList.add("visible");
    if (chatInput) chatInput.focus();
  }

  function closeChat() {
    if (chatWindow) chatWindow.classList.remove("visible");
    if (chatOverlay) chatOverlay.classList.remove("visible");
    if (initialState) initialState.style.display = "block";
    messageCounter = 0;
    localStorage.removeItem("chatIsOpen");
  }

  // ===== Отправка в n8n =====
  async function sendMessageToN8n(userMessage) {
    let currentSessionId = localStorage.getItem("chatSessionId");
    if (!currentSessionId) {
      currentSessionId = window.chatSessionId;
      localStorage.setItem("chatSessionId", currentSessionId);
    }

    const n8nBackendUrl = "https://auto.golubef.store/webhook/golubef-ai";
    const authToken = window.GOLUBEF_AI_N8N_TOKEN || window.GOLUBEFAIN8NTOKEN || "";
    const cleanUserId = window.chatUserId.startsWith("guest_")
      ? window.chatUserId.substring(6)
      : window.chatUserId;

    const payload = {
      sessionId: currentSessionId,
      userId: cleanUserId,
      message: userMessage
    };

    try {
      const response = await fetch(n8nBackendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + authToken
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("HTTP error! status: " + response.status);

      const responseData = await response.json();

      if (responseData.sessionId) {
        setSessionId(responseData.sessionId);
      }

      localStorage.setItem("chatSessionId", currentSessionId);

      return responseData;
    } catch (error) {
      return {
        action: "error",
        response: "Ошибка! Не удалось отправить сообщение.",
        error
      };
    }
  }

  // ===== helper: блокировка/разблокировка ввода + статус =====
  function setWaitingForAI(isWaiting) {
    if (isWaiting) {
      if (chatInput) chatInput.disabled = true;
      if (chatSendButton) chatSendButton.disabled = true;
      if (initialChatInput) initialChatInput.disabled = true;
      if (initialChatSendButton) initialChatSendButton.disabled = true;

      if (chatStatusMessage) {
        chatStatusMessage.style.display = "block";
        chatStatusMessage.textContent = "Golubef AI обрабатывает ваш запрос...";
      }
      if (chatProgressBar) {
        chatProgressBar.style.width = "0%";
        // простая псевдо-анимация прогресса
        let w = 0;
        chatProgressBar._timer && clearInterval(chatProgressBar._timer);
        chatProgressBar._timer = setInterval(() => {
          w += 10;
          if (w > 90) w = 90;
          chatProgressBar.style.width = w + "%";
        }, 300);
      }
    } else {
      if (chatInput) chatInput.disabled = false;
      if (chatSendButton) chatSendButton.disabled = false;
      if (initialChatInput) initialChatInput.disabled = false;
      if (initialChatSendButton) initialChatSendButton.disabled = false;
      if (chatInput) chatInput.focus();

      if (chatStatusMessage) {
        chatStatusMessage.style.display = "none";
      }
      if (chatProgressBar) {
        if (chatProgressBar._timer) clearInterval(chatProgressBar._timer);
        chatProgressBar.style.width = "100%";
        setTimeout(() => {
          chatProgressBar.style.width = "0%";
        }, 300);
      }
    }
  }

  // ===== handleSendMessage =====
  async function handleSendMessage(messageText, isQuickReply = false) {
    if (!messageText || !messageText.trim()) return;
    if (!chatWindow.classList.contains("visible")) openChat();
    if (messageCounter >= MESSAGELIMIT) {
      addMessage(
        "Чат ограничен по количеству сообщений. Обновите страницу для нового диалога.",
        "system"
      );
      return;
    }

    let checkSessionId = localStorage.getItem("chatSessionId");
    if (!checkSessionId) {
      const newSessionId = crypto.randomUUID();
      localStorage.setItem("chatSessionId", newSessionId);
      window.chatSessionId = newSessionId;
    }

    addMessage(messageText, "user");
    messageCounter++;
    if (chatInput) chatInput.value = "";
    if (initialChatInput) initialChatInput.value = "";

    // индикатор печати + статус + блокировка
    const typingIndicator = showTypingIndicator();
    setWaitingForAI(true);

    try {
      const n8nResponse = await sendMessageToN8n(messageText);
      removeTypingIndicator(typingIndicator);

      if (n8nResponse.action === "request_feedback") {
        if (n8nResponse.sessionId) setSessionId(n8nResponse.sessionId);

        if (n8nResponse.response) {
          addMessage(n8nResponse.response, "assistant", true);
        }
        if (n8nResponse.feedbackUI) {
          addMessage(n8nResponse.feedbackUI, "assistant", true, false);
        }
      } else {
        addMessage(n8nResponse.response || "Нет ответа.", "assistant", true);
      }

      if (n8nResponse.quickreplies && n8nResponse.quickreplies.length > 0) {
        updateQuickReplies(n8nResponse.quickreplies);
      }
    } catch (error) {
      removeTypingIndicator(typingIndicator);
      addMessage("Ошибка отправки сообщения.", "system");
    } finally {
      setWaitingForAI(false);
    }
  }

  // ===== Привязка событий =====
  const chatClearButton = document.getElementById("chat-clear-button");
  if (chatClearButton) {
    chatClearButton.addEventListener("click", () => {
      if (chatMessages) {
        chatMessages.innerHTML = "";
        addMessage("Чат очищен. Можете начать новый диалог.", "system", false);
      }
      localStorage.removeItem("chatHistory");
    });
  }

  if (chatCloseButton) chatCloseButton.addEventListener("click", closeChat);
  if (chatOverlay) chatOverlay.addEventListener("click", closeChat);

  if (initialChatSendButton && initialChatInput) {
    initialChatSendButton.addEventListener("click", () =>
      handleSendMessage(initialChatInput.value)
    );
    initialChatInput.addEventListener("keypress", e => {
      if (e.key === "Enter") handleSendMessage(initialChatInput.value);
    });
  }

  document.querySelectorAll(".quick-reply-chip").forEach(button => {
    button.addEventListener("click", () =>
      handleSendMessage(button.textContent, true)
    );
  });

  if (chatSendButton && chatInput) {
    chatSendButton.addEventListener("click", () =>
      handleSendMessage(chatInput.value)
    );
    chatInput.addEventListener("keypress", e => {
      if (e.key === "Enter") handleSendMessage(chatInput.value);
    });
  }

  loadChatHistory();
});
