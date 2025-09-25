// Complete app.js for Hideout Chat - All Modes
// Place this in /public/app.js and include it in your index.html

// Create floating particles
function createParticles() {
    const particlesContainer = document.querySelector('.particles-container');
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 20 + 's';
      particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
      particlesContainer.appendChild(particle);
    }
  }
  
  // Initialize particles when page loads
  createParticles();
  
  // Socket connection
  const socket = io();
  
  // Global variables
  let nickname = "";
  let avatar = "";
  let currentRoom = "";
  let isTyping = false;
  let currentPartner = null;
  
  // 1v1 mode variables
  let waitingInterval;
  let slideInterval;
  
  // DOM elements
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const messages = document.getElementById("messages");
  const typing = document.getElementById("typing");
  const backBtn = document.getElementById("back-btn");
  const userInfo = document.querySelector('.user-info');
  const userAvatar = document.querySelector('.user-avatar');
  const userName = document.querySelector('.user-name');
  const roomName = document.getElementById('room-name');
  const userCount = document.getElementById('user-count');
  const charCount = document.getElementById('char-count');
  const connectionStatus = document.getElementById('connection-status');
  const sendBtn = document.getElementById('send-btn');
  
  // Timers
  let typingTimer;
  let typingUsers = new Set();
  
  // ===== UTILITY FUNCTIONS =====
  
  // Character counter
  input.addEventListener('input', () => {
    charCount.textContent = input.value.length;
    
    // Update send button state
    if (input.value.trim().length > 0) {
      sendBtn.classList.add('active');
    } else {
      sendBtn.classList.remove('active');
    }
  });
  
  // Notification system
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    document.getElementById('notification-container').appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  // Sound effects
  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Sound not available
    }
  }
  
  // ===== CONNECTION HANDLERS =====
  
  socket.on('connect', () => {
    connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> Connected';
    connectionStatus.className = 'connection-status connected';
  });
  
  socket.on('disconnect', () => {
    connectionStatus.innerHTML = '<i class="fas fa-wifi-slash"></i> Disconnected';
    connectionStatus.className = 'connection-status disconnected';
    showNotification('Connection lost. Attempting to reconnect...', 'error');
  });
  
  socket.on('reconnect', () => {
    showNotification('Reconnected successfully!', 'success');
  });
  
  // Welcome event - receive nickname & avatar
  socket.on("welcome", (data) => {
    nickname = data.nickname;
    avatar = data.avatar;
    userName.textContent = nickname;
    userAvatar.src = data.avatar;
    userInfo.style.display = 'flex';
    showNotification(`Welcome, ${nickname}!`, 'success');
  });
  
  // ===== MODE SELECTION =====
  
  function joinMode(mode) {
    document.getElementById("mode-selection").style.display = "none";
  
    if (mode === "1v1") {
      // Handle 1v1 mode
      showWaitingScreen();
      socket.emit("join1v1");
    } else {
      // Handle all other existing modes (random, room, interest)
      document.getElementById("chat-container").style.display = "flex";
      backBtn.style.display = "inline-block";
  
      if (mode === "room") {
        document.getElementById("room-selection").style.display = "block";
        roomName.textContent = "Private Room";
      } else if (mode === "interest") {
        document.getElementById("interest-selection").style.display = "block";
        roomName.textContent = "Interest Chat";
      } else if (mode === "random") {
        socket.emit("joinMode", "random");
        roomName.textContent = "Random Chat";
        currentRoom = "random";
      }
    }
  }
  
  // ===== 1V1 MODE FUNCTIONS =====
  
  function showWaitingScreen() {
    document.getElementById("waiting-container").style.display = "flex";
    startAvatarSlideshow();
    startWaitingAnimation();
  }
  
  function hideWaitingScreen() {
    document.getElementById("waiting-container").style.display = "none";
    stopAvatarSlideshow();
    stopWaitingAnimation();
  }
  
  function startAvatarSlideshow() {
    const slides = document.querySelectorAll('.avatar-slide');
    let currentSlide = 0;
    
    slideInterval = setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add('active');
    }, 2000);
  }
  
  function stopAvatarSlideshow() {
    if (slideInterval) {
      clearInterval(slideInterval);
    }
  }
  
  function startWaitingAnimation() {
    const messages = [
      "Searching for someone to chat with...",
      "Looking for your perfect match...",
      "Finding an interesting person...",
      "Almost there, hang tight...",
      "Connecting you with someone new..."
    ];
    
    let messageIndex = 0;
    const messageElement = document.getElementById('queue-message');
    
    waitingInterval = setInterval(() => {
      messageElement.textContent = messages[messageIndex];
      messageIndex = (messageIndex + 1) % messages.length;
    }, 3000);
  }
  
  function stopWaitingAnimation() {
    if (waitingInterval) {
      clearInterval(waitingInterval);
    }
  }
  
  // ===== ROOM JOINING HANDLERS =====
  
  // Join room with validation
  document.getElementById("join-room-btn").onclick = () => {
    const room = document.getElementById("room").value.trim();
    if (!room) {
      showNotification('Please enter a room code', 'error');
      return;
    }
    if (room.length < 3) {
      showNotification('Room code must be at least 3 characters', 'error');
      return;
    }
    socket.emit("joinMode", "room", room);
    document.getElementById("room-selection").style.display = "none";
    roomName.textContent = `Room: ${room}`;
    currentRoom = room;
  };
  
  // Join interest
  document.getElementById("join-interest-btn").onclick = () => {
    const interest = document.getElementById("interest").value;
    const interestText = document.getElementById("interest").selectedOptions[0].text;
    socket.emit("joinMode", "interest", interest);
    document.getElementById("interest-selection").style.display = "none";
    roomName.textContent = interestText;
    currentRoom = interest;
  };
  
  // ===== BACK BUTTON HANDLERS =====
  
  // Main chat back button
  backBtn.onclick = () => {
    const message = currentPartner 
      ? 'Are you sure you want to leave this 1v1 chat?' 
      : 'Are you sure you want to leave the chat?';
      
    if (confirm(message)) {
      if (currentPartner) {
        socket.emit("leave1v1");
        currentPartner = null;
      }
      
      socket.disconnect();
      setTimeout(() => {
        location.reload();
      }, 100);
    }
  };
  
  // Waiting screen back button
  document.getElementById("waiting-back-btn").onclick = () => {
    if (confirm('Are you sure you want to stop looking for a chat partner?')) {
      socket.emit("leave1v1");
      hideWaitingScreen();
      document.getElementById("mode-selection").style.display = "block";
    }
  };
  
  // ===== MESSAGE HANDLING =====
  
  // Enhanced message sending
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (message && message.length <= 500) {
      socket.emit("chat message", message);
      input.value = "";
      charCount.textContent = "0";
      sendBtn.classList.remove('active');
      socket.emit("stopTyping");
      clearTimeout(typingTimer);
      isTyping = false;
    }
  });
  
  // Enhanced typing indicator
  input.addEventListener("input", () => {
    if (input.value.trim() && !isTyping) {
      socket.emit("typing");
      isTyping = true;
    }
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket.emit("stopTyping");
      isTyping = false;
    }, 2000);
    
    if (!input.value.trim() && isTyping) {
      socket.emit("stopTyping");
      isTyping = false;
    }
  });
  
  // ===== SOCKET EVENT LISTENERS =====
  
  // Room updates
  socket.on("roomUpdate", (data) => {
    userCount.textContent = data.userCount;
  });
  
  // Display enhanced messages
  socket.on("chat message", (data) => {
    const li = document.createElement("li");
    
    if (data.type === "system") {
      li.className = "system-message";
      li.innerHTML = `<i class="fas fa-info-circle"></i> ${data.msg}`;
    } else {
      li.className = "message-item";
      
      const avatar = document.createElement("img");
      avatar.className = "message-avatar";
      avatar.src = data.avatar || "/avatars/avatar1.png";
      avatar.alt = data.nickname;
      avatar.onerror = () => avatar.src = "/avatars/avatar1.png";
      
      const content = document.createElement("div");
      content.className = "message-content";
      
      const header = document.createElement("div");
      header.className = "message-header";
      
      const author = document.createElement("span");
      author.className = "message-author";
      author.textContent = data.nickname;
      
      const time = document.createElement("span");
      time.className = "message-time";
      time.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString([], {
        hour: '2-digit', 
        minute: '2-digit'
      });
      
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = data.msg;
      
      header.appendChild(author);
      header.appendChild(time);
      content.appendChild(header);
      content.appendChild(text);
      li.appendChild(avatar);
      li.appendChild(content);
    }
    
    messages.appendChild(li);
    messages.scrollTop = messages.scrollHeight;
    
    // Add glow effect for new messages
    li.classList.add('glow');
    setTimeout(() => li.classList.remove('glow'), 2000);
    
    // Play sound effect (optional)
    if (data.nickname !== nickname) {
      playNotificationSound();
    }
  });
  
  // Enhanced typing indicator
  socket.on("typing", (name) => {
    typingUsers.add(name);
    updateTypingIndicator();
  });
  
  socket.on("stopTyping", (name) => {
    typingUsers.delete(name);
    updateTypingIndicator();
  });
  
  function updateTypingIndicator() {
    if (typingUsers.size === 0) {
      typing.innerHTML = "";
      return;
    }
    
    const names = Array.from(typingUsers);
    let text = "";
    
    if (names.length === 1) {
      text = `${names[0]} is typing`;
    } else if (names.length === 2) {
      text = `${names[0]} and ${names[1]} are typing`;
    } else {
      text = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are typing`;
    }
    
    typing.innerHTML = `
      <div class="typing-animation">
        <span>${text}</span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
  }
  
  // ===== 1V1 MODE SOCKET EVENTS =====
  
  socket.on("queueStatus", (data) => {
    document.getElementById("queue-position").textContent = data.position;
    document.getElementById("queue-status").textContent = data.message;
    document.getElementById("people-waiting").textContent = data.position;
  });
  
  socket.on("matched", (data) => {
    currentPartner = data;
    hideWaitingScreen();
    
    // Show chat container
    document.getElementById("chat-container").style.display = "flex";
    roomName.textContent = `1v1 with ${data.partnerName}`;
    currentRoom = data.roomId;
    
    // Clear previous messages
    messages.innerHTML = "";
    
    showNotification(`You've been matched with ${data.partnerName}!`, 'success');
  });
  
  socket.on("partnerDisconnected", (data) => {
    showNotification(`${data.partnerName} has disconnected. Finding you a new partner...`, 'info');
    
    // Hide chat and show waiting screen again
    document.getElementById("chat-container").style.display = "none";
    showWaitingScreen();
    currentPartner = null;
    currentRoom = "";
  });
  
  // ===== KEYBOARD SHORTCUTS =====
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('chat-container').style.display === 'flex') {
      backBtn.click();
    }
  });
  
  // ===== AUTO-FOCUS AND OBSERVERS =====
  
  // Auto-focus input when in chat
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.id === 'chat-container' && mutation.target.style.display === 'flex') {
        setTimeout(() => {
          if (input.style.display !== 'none') {
            input.focus();
          }
        }, 100);
      }
    });
  });
  
  observer.observe(document.getElementById('chat-container'), {
    attributes: true,
    attributeFilter: ['style']
  });
  
  // ===== HEARTBEAT =====
  
  // Heartbeat to maintain connection
  setInterval(() => {
    socket.emit('ping');
  }, 30000);
  
  socket.on('pong', () => {
    // Connection is alive
  });
  
  // ===== GLOBAL ERROR HANDLING =====
  
  window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    showNotification('Something went wrong. Please refresh if issues persist.', 'error');
  });
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
  });
  
  // ===== INITIALIZATION =====
  
  console.log('🚀 Hideout Chat App initialized');
  console.log('📱 All chat modes ready: Random, Room, Interest, 1v1');