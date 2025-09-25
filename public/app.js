// app.js
const socket = io();

// DOM elements
const modeSelection = document.getElementById("mode-selection");
const chatContainer = document.getElementById("chat-container");
const waitingContainer = document.getElementById("waiting-container");

const messages = document.getElementById("messages");
const form = document.getElementById("form");
const input = document.getElementById("input");
const charCount = document.getElementById("char-count");
const typingDiv = document.getElementById("typing");

const roomSelection = document.getElementById("room-selection");
const interestSelection = document.getElementById("interest-selection");
const roomName = document.getElementById("room-name");
const userCount = document.getElementById("user-count");

const backBtn = document.getElementById("back-btn");
const waitingBackBtn = document.getElementById("waiting-back-btn");

const queueStatus = document.getElementById("queue-status");
const queueMessage = document.getElementById("queue-message");
const queuePosition = document.getElementById("queue-position");
const peopleWaiting = document.getElementById("people-waiting");

// Globals
let currentMode = null;
let nickname = null;
let avatar = null;

// ==================== UTILITIES ====================
function showNotification(message, type = "info") {
  const container = document.getElementById("notification-container");
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = message;

  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => container.removeChild(notification), 300);
  }, 4000);
}

function autoScroll() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage({ nickname, avatar, msg, type, timestamp }) {
  const item = document.createElement("li");
  item.className = type === "system" ? "system-message" : "chat-message";

  if (type === "system") {
    item.innerHTML = `<span class="system-text">${msg}</span>`;
  } else {
    item.innerHTML = `
      <div class="msg-avatar"><img src="${avatar}" /></div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-name">${nickname}</span>
          <span class="msg-time">${new Date(timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="msg-text">${msg}</div>
      </div>
    `;
  }

  messages.appendChild(item);
  autoScroll();
}

// ==================== MODE HANDLER ====================
function joinMode(mode) {
  currentMode = mode;
  modeSelection.style.display = "none";

  if (mode === "room") {
    chatContainer.style.display = "block";
    roomSelection.style.display = "block";
    interestSelection.style.display = "none";
  } else if (mode === "interest") {
    chatContainer.style.display = "block";
    interestSelection.style.display = "block";
    roomSelection.style.display = "none";
  } else if (mode === "random") {
    chatContainer.style.display = "block";
    roomSelection.style.display = "none";
    interestSelection.style.display = "none";
    socket.emit("joinRandom");
  } else if (mode === "1v1") {
    waitingContainer.style.display = "block";
    socket.emit("join1v1");
  }
}

function leaveChat() {
  if (currentMode === "1v1") {
    socket.emit("leave1v1");
    waitingContainer.style.display = "none";
  } else {
    socket.emit("leaveRoom");
    chatContainer.style.display = "none";
  }
  modeSelection.style.display = "block";
  messages.innerHTML = "";
  typingDiv.innerHTML = "";
  currentMode = null;
}

// ==================== FORM HANDLERS ====================
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (input.value.trim()) {
    socket.emit("chat message", input.value.trim());
    input.value = "";
    charCount.textContent = "0";
  }
});

input?.addEventListener("input", () => {
  charCount.textContent = input.value.length;
  socket.emit("typing", input.value.length > 0);
});

// Room selection
document.getElementById("join-room-btn")?.addEventListener("click", () => {
  const room = document.getElementById("room").value.trim();
  if (room) {
    socket.emit("joinRoom", room);
    roomName.textContent = `Room: ${room}`;
    roomSelection.style.display = "none";
  }
});

// Interest selection
document.getElementById("join-interest-btn")?.addEventListener("click", () => {
  const interest = document.getElementById("interest").value;
  socket.emit("joinInterest", interest);
  roomName.textContent = `Interest: ${interest}`;
  interestSelection.style.display = "none";
});

// Back buttons
backBtn?.addEventListener("click", leaveChat);
waitingBackBtn?.addEventListener("click", leaveChat);

// ==================== SOCKET EVENTS ====================
socket.on("welcome", ({ nickname: nn, avatar: av }) => {
  nickname = nn;
  avatar = av;
  document.querySelector(".user-info").style.display = "flex";
  document.querySelector(".user-name").textContent = nickname;
  document.querySelector(".user-avatar").src = avatar;
});

socket.on("chat message", (msg) => addMessage(msg));

socket.on("typing", ({ nickname, isTyping }) => {
  if (isTyping) {
    typingDiv.textContent = `${nickname} is typing...`;
  } else {
    typingDiv.textContent = "";
  }
});

socket.on("userCount", (count) => {
  userCount.textContent = count;
});

// 1v1 EVENTS
socket.on("queueStatus", ({ position, message }) => {
  queueStatus.textContent = message;
  queueMessage.textContent = message;
  queuePosition.textContent = position;
  peopleWaiting.textContent = position > 1 ? position - 1 : 0;
});

socket.on("matched", ({ partnerName, partnerAvatar, roomId }) => {
  waitingContainer.style.display = "none";
  chatContainer.style.display = "block";
  roomName.textContent = `1v1 with ${partnerName}`;
  showNotification(`Matched with ${partnerName}!`, "success");
});

socket.on("partnerDisconnected", ({ partnerName }) => {
  showNotification(`${partnerName} disconnected. Waiting for a new match...`, "warning");
  chatContainer.style.display = "none";
  waitingContainer.style.display = "block";
});

// ==================== SLIDESHOW (WAITING PAGE) ====================
const slides = document.querySelectorAll(".avatar-slide");
let currentSlide = 0;
function nextSlide() {
  slides[currentSlide].classList.remove("active");
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide].classList.add("active");
}
setInterval(nextSlide, 2000);
