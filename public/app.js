// Complete app.js for Hideout Chat - All Modes with Responsive Design
// Place this in /public/app.js and include it in your index.html

// Create floating particles
function createParticles() {
    const particlesContainer = document.querySelector('.particles-container');
    if (!particlesContainer) return;
    
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
  if (input && charCount) {
    input.addEventListener('input', () => {
      charCount.textContent = input.value.length;
      
      // Update send button state
      if (input.value.trim().length > 0) {
        sendBtn.classList.add('active');
      } else {
        sendBtn.classList.remove('active');
      }
    });
  }
  
  // Notification system
  function showNotification(message, type = 'info') {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    
    notificationContainer.appendChild(notification);
    
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
    if (connectionStatus) {
      connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> Connected';
      connectionStatus.className = 'connection-status connected';
    }
  });
  
  socket.on('disconnect', () => {
    if (connectionStatus) {
      connectionStatus.innerHTML = '<i class="fas fa-wifi-slash"></i> Disconnected';
      connectionStatus.className = 'connection-status disconnected';
    }
    showNotification('Connection lost. Attempting to reconnect...', 'error');
  });
  
  socket.on('reconnect', () => {
    showNotification('Reconnected successfully!', 'success');
  });
  
  // Welcome event - receive nickname & avatar
  socket.on("welcome", (data) => {
    nickname = data.nickname;
    avatar = data.avatar;
    if (userName) userName.textContent = nickname;
    if (userAvatar) userAvatar.src = data.avatar;
    if (userInfo) userInfo.style.display = 'flex';
    showNotification(`Welcome, ${nickname}!`, 'success');
  });
  
  // ===== UTILITY FUNCTIONS FOR FORM HANDLING =====
  
  function resetChatContainer() {
    // Hide all forms
    const roomSelection = document.getElementById("room-selection");
    const interestSelection = document.getElementById("interest-selection");
    const chatContainer = document.getElementById("chat-container");
    
    if (roomSelection) roomSelection.style.display = "none";
    if (interestSelection) interestSelection.style.display = "none";
    
    // Remove form class
    if (chatContainer) chatContainer.classList.remove("show-form");
    
    // Clear input values
    const roomInput = document.getElementById("room");
    const interestSelect = document.getElementById("interest");
    if (roomInput) roomInput.value = "";
    if (interestSelect) interestSelect.selectedIndex = 0;
    
    // Clear messages
    if (messages) messages.innerHTML = "";
    
    // Reset room info
    currentRoom = "";
    currentPartner = null;
  }
  
  function focusInputWhenReady() {
    const chatContainer = document.getElementById("chat-container");
    const isFormVisible = chatContainer && chatContainer.classList.contains("show-form");
    
    if (!isFormVisible && chatContainer && chatContainer.style.display === "flex" && input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }
  
  // ===== MODE SELECTION =====
  
  function joinMode(mode) {
    const modeSelection = document.getElementById("mode-selection");
    const chatContainer = document.getElementById("chat-container");
    
    if (modeSelection) modeSelection.style.display = "none";
  
    if (mode === "1v1") {
      // Handle 1v1 mode - show waiting screen
      showWaitingScreen();
      socket.emit("join1v1");
    } else {
      // Handle all other existing modes (random, room, interest)
      if (chatContainer) chatContainer.style.display = "flex";
      if (backBtn) backBtn.style.display = "inline-block";
  
      if (mode === "room") {
        // Show room form and hide message containers
        chatContainer.classList.add("show-form");
        const roomSelection = document.getElementById("room-selection");
        if (roomSelection) roomSelection.style.display = "block";
        if (roomName) roomName.textContent = "Private Room";
      } else if (mode === "interest") {
        // Show interest form and hide message containers
        chatContainer.classList.add("show-form");
        const interestSelection = document.getElementById("interest-selection");
        if (interestSelection) interestSelection.style.display = "block";
        if (roomName) roomName.textContent = "Interest Chat";
      } else if (mode === "random") {
        // Random mode - join immediately, show chat
        chatContainer.classList.remove("show-form");
        socket.emit("joinMode", "random");
        if (roomName) roomName.textContent = "Random Chat";
        currentRoom = "random";
        focusInputWhenReady();
      }
    }
  }
  
  // ===== 1V1 MODE FUNCTIONS =====
  
  function showWaitingScreen() {
    const waitingContainer = document.getElementById("waiting-container");
    if (waitingContainer) {
      waitingContainer.style.display = "flex";
      startAvatarSlideshow();
      startWaitingAnimation();
    }
  }
  
  function hideWaitingScreen() {
    const waitingContainer = document.getElementById("waiting-container");
    if (waitingContainer) {
      waitingContainer.style.display = "none";
      stopAvatarSlideshow();
      stopWaitingAnimation();
    }
  }
  
  function startAvatarSlideshow() {
    const slides = document.querySelectorAll('.avatar-slide');
    if (slides.length === 0) return;
    
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
    
    if (!messageElement) return;
    
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
  const joinRoomBtn = document.getElementById("join-room-btn");
  if (joinRoomBtn) {
    joinRoomBtn.onclick = () => {
      const roomInput = document.getElementById("room");
      const room = roomInput ? roomInput.value.trim() : "";
      
      if (!room) {
        showNotification('Please enter a room code', 'error');
        return;
      }
      if (room.length < 3) {
        showNotification('Room code must be at least 3 characters', 'error');
        return;
      }
      
      // Hide the form and show chat interface
      const roomSelection = document.getElementById("room-selection");
      const chatContainer = document.getElementById("chat-container");
      
      if (roomSelection) roomSelection.style.display = "none";
      if (chatContainer) chatContainer.classList.remove("show-form");
      
      // Join the room
      socket.emit("joinMode", "room", room);
      if (roomName) roomName.textContent = `Room: ${room}`;
      currentRoom = room;
      
      // Clear previous messages
      if (messages) messages.innerHTML = "";
      
      showNotification(`Joined room: ${room}`, 'success');
      focusInputWhenReady();
    };
  }
  
  // Join interest
  const joinInterestBtn = document.getElementById("join-interest-btn");
  if (joinInterestBtn) {
    joinInterestBtn.onclick = () => {
      const interestSelect = document.getElementById("interest");
      if (!interestSelect) return;
      
      const interest = interestSelect.value;
      const interestText = interestSelect.selectedOptions[0].text;
      
      // Hide the form and show chat interface
      const interestSelection = document.getElementById("interest-selection");
      const chatContainer = document.getElementById("chat-container");
      
      if (interestSelection) interestSelection.style.display = "none";
      if (chatContainer) chatContainer.classList.remove("show-form");
      
      // Join the interest room
      socket.emit("joinMode", "interest", interest);
      if (roomName) roomName.textContent = interestText;
      currentRoom = interest;
      
      // Clear previous messages
      if (messages) messages.innerHTML = "";
      
      showNotification(`Joined ${interestText}`, 'success');
      focusInputWhenReady();
    };
  }
  
  // ===== BACK BUTTON HANDLERS =====
  
  // Main chat back button
  if (backBtn) {
    backBtn.onclick = () => {
      const chatContainer = document.getElementById("chat-container");
      const isInForm = chatContainer && chatContainer.classList.contains("show-form");
      
      if (isInForm) {
        // If in form, just go back to mode selection without confirmation
        resetChatContainer();
        if (chatContainer) chatContainer.style.display = "none";
        const modeSelection = document.getElementById("mode-selection");
        if (modeSelection) modeSelection.style.display = "block";
      } else {
        // If in chat, ask for confirmation
        const message = currentPartner 
          ? 'Are you sure you want to leave this 1v1 chat?' 
          : 'Are you sure you want to leave the chat?';
          
        if (confirm(message)) {
          if (currentPartner) {
            socket.emit("leave1v1");
          }
          
          resetChatContainer();
          socket.disconnect();
          setTimeout(() => {
            location.reload();
          }, 100);
        }
      }
    };
  }
  
  // Waiting screen back button
  const waitingBackBtn = document.getElementById("waiting-back-btn");
  if (waitingBackBtn) {
    waitingBackBtn.onclick = () => {
      if (confirm('Are you sure you want to stop looking for a chat partner?')) {
        socket.emit("leave1v1");
        hideWaitingScreen();
        const modeSelection = document.getElementById("mode-selection");
        if (modeSelection) modeSelection.style.display = "block";
      }
    };
  }
  
  // ===== MESSAGE HANDLING =====
  
  // Enhanced message sending
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const message = input ? input.value.trim() : "";
      if (message && message.length <= 500) {
        socket.emit("chat message", message);
        if (input) input.value = "";
        if (charCount) charCount.textContent = "0";
        if (sendBtn) sendBtn.classList.remove('active');
        socket.emit("stopTyping");
        clearTimeout(typingTimer);
        isTyping = false;
      }
    });
  }
  
  // Enhanced typing indicator
  if (input) {
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
  }
  
  // ===== SOCKET EVENT LISTENERS =====
  
  // Room updates
  socket.on("roomUpdate", (data) => {
    if (userCount) userCount.textContent = data.userCount;
  });
  
  // Display enhanced messages
  socket.on("chat message", (data) => {
    if (!messages) return;
    
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
    if (!typing) return;
    
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
    const queuePosition = document.getElementById("queue-position");
    const queueStatus = document.getElementById("queue-status");
    const peopleWaiting = document.getElementById("people-waiting");
    
    if (queuePosition) queuePosition.textContent = data.position;
    if (queueStatus) queueStatus.textContent = data.message;
    if (peopleWaiting) peopleWaiting.textContent = data.position;
  });
  
  socket.on("matched", (data) => {
    currentPartner = data;
    hideWaitingScreen();
    
    // Show chat container without form class
    const chatContainer = document.getElementById("chat-container");
    if (chatContainer) {
      chatContainer.style.display = "flex";
      chatContainer.classList.remove("show-form");
    }
    if (roomName) roomName.textContent = `1v1 with ${data.partnerName}`;
    currentRoom = data.roomId;
    
    // Clear previous messages
    if (messages) messages.innerHTML = "";
    
    showNotification(`You've been matched with ${data.partnerName}!`, 'success');
    
    // Focus on input after a short delay
    setTimeout(() => {
      if (input) input.focus();
    }, 300);
  });
  
  socket.on("partnerDisconnected", (data) => {
    showNotification(`${data.partnerName} has disconnected. Finding you a new partner...`, 'info');
    
    // Hide chat and show waiting screen again
    const chatContainer = document.getElementById("chat-container");
    if (chatContainer) chatContainer.style.display = "none";
    showWaitingScreen();
    currentPartner = null;
    currentRoom = "";
  });
  
  // ===== KEYBOARD SHORTCUTS AND NAVIGATION =====
  
  document.addEventListener('keydown', (e) => {
    // Escape key handling
    if (e.key === 'Escape') {
      const chatContainer = document.getElementById("chat-container");
      const waitingContainer = document.getElementById("waiting-container");
      
      const isInForm = chatContainer && chatContainer.classList.contains("show-form");
      const isInWaiting = waitingContainer && waitingContainer.style.display === "flex";
      const isInChat = chatContainer && chatContainer.style.display === "flex" && !isInForm;
      
      if (isInForm) {
        // Go back to mode selection from forms
        resetChatContainer();
        if (chatContainer) chatContainer.style.display = "none";
        const modeSelection = document.getElementById("mode-selection");
        if (modeSelection) modeSelection.style.display = "block";
      } else if (isInWaiting && waitingBackBtn) {
        // Go back from waiting screen
        waitingBackBtn.click();
      } else if (isInChat && backBtn) {
        // Go back from chat
        backBtn.click();
      }
    }
    
    // Enter key for forms
    if (e.key === 'Enter') {
      const roomInput = document.getElementById("room");
      
      if (document.activeElement === roomInput && roomInput && roomInput.value.trim()) {
        const joinRoomBtn = document.getElementById("join-room-btn");
        if (joinRoomBtn) joinRoomBtn.click();
      }
    }
  });
  
  // ===== INPUT VALIDATION =====
  
  // Enhanced room input validation
  const roomInput = document.getElementById("room");
  if (roomInput && joinRoomBtn) {
    roomInput.addEventListener('input', (e) => {
      const value = e.target.value;
      
      if (value.trim().length >= 3) {
        joinRoomBtn.disabled = false;
        joinRoomBtn.style.opacity = "1";
      } else {
        joinRoomBtn.disabled = true;
        joinRoomBtn.style.opacity = "0.6";
      }
    });
  }
  
  // ===== AUTO-FOCUS AND OBSERVERS =====
  
  // Auto-focus input when in chat
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.id === 'chat-container' && 
          mutation.target.style.display === 'flex' &&
          !mutation.target.classList.contains('show-form')) {
        setTimeout(() => {
          if (input && input.style.display !== 'none') {
            input.focus();
          }
        }, 100);
      }
    });
  });
  
  const chatContainer = document.getElementById('chat-container');
  if (chatContainer) {
    observer.observe(chatContainer, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }
  
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
  
  // Initialize button states on page load
  document.addEventListener('DOMContentLoaded', () => {
    const joinRoomBtn = document.getElementById("join-room-btn");
    if (joinRoomBtn) {
      joinRoomBtn.disabled = true;
      joinRoomBtn.style.opacity = "0.6";
    }
  });
  
  // Mobile viewport height fix
  function setVH() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  
  // Set initial viewport height
  setVH();
  
  // Update on resize
  window.addEventListener('resize', setVH);
  
  // Prevent zoom on double tap for iOS
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, false);
  
  // Service Worker registration (optional for PWA capabilities)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Uncomment the next lines if you want to add PWA support
      // navigator.serviceWorker.register('/sw.js')
      //   .then((registration) => console.log('SW registered'))
      //   .catch((registrationError) => console.log('SW registration failed'));
    });
  }
  
  // ===== ACCESSIBILITY ENHANCEMENTS =====
  
  // Skip to main content link
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector('#main-content') || document.querySelector('#messages');
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
  
  // Announce important changes to screen readers
  function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }
  
  // Use announcements for important state changes
  socket.on("matched", (data) => {
    announceToScreenReader(`You have been matched with ${data.partnerName} for a 1 on 1 chat`);
  });
  
  socket.on("chat message", (data) => {
    if (data.type === "system") {
      announceToScreenReader(data.msg);
    }
  });
  
  console.log('🚀 Hideout Chat App initialized');
  console.log('📱 All chat modes ready: Random, Room, Interest, 1v1');
  console.log('♿ Accessibility features enabled');
  console.log('📐 Responsive design active');
  console.log('🔧 Form handling optimized');