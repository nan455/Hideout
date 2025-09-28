const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  allowEIO3: true
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

const MAX_CONNECTIONS = 2000;
const connectionLimiter = new Map();
const MAX_CONNECTIONS_PER_IP = 5;
const messageRates = new Map();
const MESSAGE_RATE_LIMIT = 15;
const RATE_WINDOW = 60000;
const MEMORY_CHECK_INTERVAL = 30000;

let performanceStats = {
  startTime: Date.now(),
  totalConnections: 0,
  totalMessages: 0,
  peakConnections: 0,
  memoryUsage: 0
};

class OptimizedRoomManager {
  constructor() {
    this.rooms = new Map();
    this.userRooms = new Map();
    this.roomStats = new Map();
    this.waitingQueue = [];
    this.activePairs = new Map();
    this.pairCounter = 0;
  }

  addUserToRoom(socket, roomName) {
    this.removeUserFromRoom(socket);

    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
      this.roomStats.set(roomName, {
        created: Date.now(),
        maxUsers: 0,
        totalMessages: 0,
        lastActivity: Date.now()
      });
    }

    const room = this.rooms.get(roomName);
    const stats = this.roomStats.get(roomName);

    room.add(socket.id);
    this.userRooms.set(socket.id, roomName);
    socket.join(roomName);
    socket.room = roomName;

    stats.maxUsers = Math.max(stats.maxUsers, room.size);
    stats.lastActivity = Date.now();

    io.to(roomName).emit("roomUpdate", {
      userCount: room.size,
      roomName: roomName
    });

    return room.size;
  }

  removeUserFromRoom(socket) {
    const roomName = this.userRooms.get(socket.id);
    if (!roomName) return;

    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(socket.id);
      socket.leave(roomName);

      io.to(roomName).emit("roomUpdate", {
        userCount: room.size,
        roomName: roomName
      });

      if (room.size === 0) {
        this.rooms.delete(roomName);
        this.roomStats.delete(roomName);
      }
    }

    this.userRooms.delete(socket.id);
    socket.room = null;
  }

  incrementMessageCount(roomName) {
    const stats = this.roomStats.get(roomName);
    if (stats) {
      stats.totalMessages++;
      stats.lastActivity = Date.now();
      performanceStats.totalMessages++;
    }
  }

  addToQueue(socket, nickname, avatar) {
    const queueUser = {
      socketId: socket.id,
      nickname,
      avatar,
      joinTime: Date.now()
    };

    this.waitingQueue.push(queueUser);
    socket.emit("queueStatus", {
      position: this.waitingQueue.length,
      message: "Looking for a partner...",
      canSkip: this.waitingQueue.length > 1
    });

    console.log(`🔍 ${nickname} joined 1v1 queue. Queue length: ${this.waitingQueue.length}`);
    this.matchUsers();
    this.updateQueuePositions();
  }

  matchUsers() {
    if (this.waitingQueue.length >= 2) {
      const user1 = this.waitingQueue.shift();
      const user2 = this.waitingQueue.shift();

      const roomId = `pair_${++this.pairCounter}_${Date.now()}`;

      this.activePairs.set(user1.socketId, {
        roomId,
        partnerId: user2.socketId,
        partnerName: user2.nickname,
        partnerAvatar: user2.avatar
      });

      this.activePairs.set(user2.socketId, {
        roomId,
        partnerId: user1.socketId,
        partnerName: user1.nickname,
        partnerAvatar: user1.avatar
      });

      const socket1 = io.sockets.sockets.get(user1.socketId);
      const socket2 = io.sockets.sockets.get(user2.socketId);

      if (socket1 && socket2) {
        socket1.join(roomId);
        socket2.join(roomId);
        socket1.room = roomId;
        socket2.room = roomId;

        socket1.emit("matched", {
          partnerId: user2.socketId,
          partnerName: user2.nickname,
          partnerAvatar: user2.avatar,
          roomId
        });

        socket2.emit("matched", {
          partnerId: user1.socketId,
          partnerName: user1.nickname,
          partnerAvatar: user1.avatar,
          roomId
        });

        io.to(roomId).emit("chat message", {
          nickname: "System",
          avatar: "",
          msg: `You've been matched! Say hello to your chat partner 👋`,
          timestamp: Date.now(),
          type: "system"
        });

        console.log(`💑 Matched ${user1.nickname} with ${user2.nickname} in room ${roomId}`);
      }
    }
    this.updateQueuePositions();
  }

  updateQueuePositions() {
    this.waitingQueue.forEach((user, index) => {
      const socket = io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.emit("queueStatus", {
          position: index + 1,
          message: index === 0 ? "You're next in line!" : `Position ${index + 1} in queue`,
          canSkip: this.waitingQueue.length > 1
        });
      }
    });
  }

  removeFromQueue(socketId) {
    const index = this.waitingQueue.findIndex(user => user.socketId === socketId);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);
      this.updateQueuePositions();
      return true;
    }
    return false;
  }

  skipCurrentPartner(socket) {
    if (this.activePairs.has(socket.id)) {
      const pairInfo = this.activePairs.get(socket.id);
      const partnerSocket = io.sockets.sockets.get(pairInfo.partnerId);
      
      if (partnerSocket) {
        // Notify partner they were skipped
        partnerSocket.emit("partnerSkipped", {
          message: "Your partner moved on to chat with someone else"
        });
        
        // Add partner back to queue
        partnerSocket.leave(pairInfo.roomId);
        partnerSocket.room = null;
        this.addToQueue(partnerSocket, partnerSocket.nickname, partnerSocket.avatar);
      }
      
      // Add current user back to queue
      socket.leave(pairInfo.roomId);
      socket.room = null;
      this.activePairs.delete(socket.id);
      this.activePairs.delete(pairInfo.partnerId);
      this.addToQueue(socket, socket.nickname, socket.avatar);
      
      console.log(`⏭️ User ${socket.nickname} skipped partner in room ${pairInfo.roomId}`);
    }
  }

  handlePairDisconnection(socket) {
    const pairInfo = this.activePairs.get(socket.id);

    if (pairInfo) {
      const partnerSocket = io.sockets.sockets.get(pairInfo.partnerId);

      if (partnerSocket) {
        partnerSocket.emit("partnerDisconnected", {
          partnerName: socket.nickname || "Your partner"
        });

        partnerSocket.leave(pairInfo.roomId);
        partnerSocket.room = null;
        this.addToQueue(partnerSocket, partnerSocket.nickname, partnerSocket.avatar);
      }

      this.activePairs.delete(socket.id);
      this.activePairs.delete(pairInfo.partnerId);
      console.log(`💔 Pair disconnected in room ${pairInfo.roomId}`);
    }
  }

  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalUsers: this.userRooms.size,
      waitingQueue: this.waitingQueue.length,
      activePairs: this.activePairs.size / 2
    };
  }
}

const roomManager = new OptimizedRoomManager();

function randomName() {
  const adjectives = [
    "Silent", "Wild", "Happy", "Crazy", "Mysterious", "Swift", "Noble", "Brave", 
    "Clever", "Gentle", "Fierce", "Wise", "Bold", "Quick", "Calm", "Bright",
    "Cool", "Smart", "Lucky", "Strong", "Free", "Kind", "Pure", "True"
  ];
  const animals = [
    "Dragon", "Tiger", "Panda", "Wolf", "Eagle", "Shark", "Lion", "Fox", 
    "Bear", "Hawk", "Deer", "Owl", "Lynx", "Raven", "Phoenix", "Jaguar",
    "Falcon", "Dolphin", "Turtle", "Butterfly", "Rabbit", "Horse", "Cat", "Dog"
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return adj + animal;
}

function randomAvatar() {
  const styles = ['avataaars', 'bottts', 'gridy', 'personas'];
  const style = styles[Math.floor(Math.random() * styles.length)];
  const seed = Math.random().toString(36).substring(7);
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
}

function isValidMessage(message) {
  if (!message || typeof message !== 'string') return false;
  if (message.length > 500) return false;
  if (message.trim().length === 0) return false;
  
  const badWords = ['spam', 'hack', 'admin', 'moderator'];
  const lowerMsg = message.toLowerCase();
  return !badWords.some(word => lowerMsg.includes(word));
}

function generateCaptcha() {
  const num1 = Math.floor(Math.random() * 20) + 1;
  const num2 = Math.floor(Math.random() * 20) + 1;
  const operators = ['+', '-', '*'];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  
  let question, answer;
  
  switch(operator) {
    case '+':
      question = `${num1} + ${num2}`;
      answer = num1 + num2;
      break;
    case '-':
      question = `${Math.max(num1, num2)} - ${Math.min(num1, num2)}`;
      answer = Math.max(num1, num2) - Math.min(num1, num2);
      break;
    case '*':
      const small1 = Math.floor(Math.random() * 10) + 1;
      const small2 = Math.floor(Math.random() * 10) + 1;
      question = `${small1} × ${small2}`;
      answer = small1 * small2;
      break;
  }
  
  return { question, answer };
}

const captchaStore = new Map();

app.post('/verify-captcha', (req, res) => {
  const { captchaId, answer } = req.body;
  const correctAnswer = captchaStore.get(captchaId);
  
  if (!correctAnswer) {
    return res.json({ success: false, message: 'Captcha expired' });
  }
  
  if (parseInt(answer) === correctAnswer) {
    captchaStore.delete(captchaId);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Incorrect answer' });
  }
});

app.get('/generate-captcha', (req, res) => {
  const captcha = generateCaptcha();
  const captchaId = Math.random().toString(36).substring(7);
  
  captchaStore.set(captchaId, captcha.answer);
  
  setTimeout(() => {
    captchaStore.delete(captchaId);
  }, 5 * 60 * 1000);
  
  res.json({
    id: captchaId,
    question: captcha.question
  });
});

app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  performanceStats.memoryUsage = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  
  res.json({
    status: 'healthy',
    connections: io.engine.clientsCount,
    uptime: Math.round(process.uptime()),
    memory: performanceStats.memoryUsage + 'MB',
    rooms: roomManager.getStats(),
    performance: performanceStats
  });
});

app.get('/stats', (req, res) => {
  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: io.engine.clientsCount
    },
    rooms: roomManager.getStats(),
    performance: performanceStats
  });
});

io.use((socket, next) => {
  if (io.engine.clientsCount >= MAX_CONNECTIONS) {
    return next(new Error('Server at capacity. Please try again later.'));
  }

  const clientIP = socket.handshake.address;
  const connections = connectionLimiter.get(clientIP) || 0;

  if (connections >= MAX_CONNECTIONS_PER_IP) {
    return next(new Error('Too many connections from this IP'));
  }

  connectionLimiter.set(clientIP, connections + 1);
  next();
});

io.on("connection", (socket) => {
  const nickname = randomName();
  const avatar = randomAvatar();
  
  socket.nickname = nickname;
  socket.avatar = avatar;
  
  performanceStats.totalConnections++;
  performanceStats.peakConnections = Math.max(
    performanceStats.peakConnections, 
    io.engine.clientsCount
  );

  console.log(`🔗 ${nickname} connected (${socket.id}) - Total: ${io.engine.clientsCount}`);

  socket.emit("welcome", { nickname, avatar });

  socket.on("joinMode", (mode, param) => {
    let roomName = "";

    if (mode === "random") {
      roomName = "random";
    } else if (mode === "room") {
      roomName = `room_${param}`;
    } else if (mode === "interest") {
      roomName = `interest_${param}`;
    }

    roomManager.addUserToRoom(socket, roomName);

    io.to(socket.room).emit("chat message", {
      nickname: "System",
      avatar: "",
      msg: `${nickname} joined the chat`,
      timestamp: Date.now(),
      type: "system"
    });

    console.log(`📥 ${nickname} joined ${socket.room}`);
  });

  socket.on("join1v1", () => {
    console.log(`🎯 ${nickname} wants to join 1v1 mode`);
    roomManager.addToQueue(socket, nickname, avatar);
  });

  socket.on("skip1v1", () => {
    console.log(`⏭️ ${nickname} wants to skip current partner`);
    roomManager.skipCurrentPartner(socket);
  });

  socket.on("leave1v1", () => {
    roomManager.removeFromQueue(socket.id);
    if (roomManager.activePairs.has(socket.id)) {
      roomManager.handlePairDisconnection(socket);
    }
    console.log(`👋 ${nickname} left 1v1 mode`);
  });

  socket.on("chat message", (msg) => {
    const now = Date.now();
    if (!messageRates.has(socket.id)) {
      messageRates.set(socket.id, { count: 0, resetTime: now + RATE_WINDOW });
    }

    const userRate = messageRates.get(socket.id);
    if (now > userRate.resetTime) {
      userRate.count = 0;
      userRate.resetTime = now + RATE_WINDOW;
    }

    if (userRate.count >= MESSAGE_RATE_LIMIT) {
      socket.emit('rate_limit', 'Too many messages. Please slow down.');
      return;
    }

    userRate.count++;

    if (!isValidMessage(msg)) {
      socket.emit('message_error', 'Invalid message content');
      return;
    }

    if (socket.room) {
      roomManager.incrementMessageCount(socket.room);
      
      io.to(socket.room).emit("chat message", {
        nickname,
        avatar,
        msg: msg.substring(0, 500),
        timestamp: Date.now(),
        type: "user"
      });

      console.log(`💬 ${nickname} in ${socket.room}: ${msg.substring(0, 50)}...`);
    }
  });

  socket.on("typing", () => {
    if (socket.room) {
      socket.to(socket.room).emit("typing", nickname);
    }
  });

  socket.on("stopTyping", () => {
    if (socket.room) {
      socket.to(socket.room).emit("stopTyping", nickname);
    }
  });

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 ${nickname} disconnected (${socket.id}) - Reason: ${reason}`);

    const clientIP = socket.handshake.address;
    const connections = connectionLimiter.get(clientIP);
    if (connections > 1) {
      connectionLimiter.set(clientIP, connections - 1);
    } else {
      connectionLimiter.delete(clientIP);
    }

    messageRates.delete(socket.id);

    roomManager.removeFromQueue(socket.id);
    if (roomManager.activePairs.has(socket.id)) {
      roomManager.handlePairDisconnection(socket);
    }

    if (socket.room) {
      io.to(socket.room).emit("chat message", {
        nickname: "System",
        avatar: "",
        msg: `${nickname} left the chat`,
        timestamp: Date.now(),
        type: "system"
      });

      roomManager.removeUserFromRoom(socket);
    }
  });
});

setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  
  performanceStats.memoryUsage = usedMB;
  
  console.log(`📊 Memory: ${usedMB}MB/${totalMB}MB | Connections: ${io.engine.clientsCount} | Rooms: ${roomManager.rooms.size}`);
  
  const now = Date.now();
  for (const [userId, rate] of messageRates.entries()) {
    if (now > rate.resetTime + RATE_WINDOW) {
      messageRates.delete(userId);
    }
  }
  
  if (usedMB > 400) {
    console.warn(`⚠️ High memory usage: ${usedMB}MB - Consider optimization`);
  }
}, MEMORY_CHECK_INTERVAL);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`🚀 Hideout Chat Server running on port ${PORT}`);
  console.log(`📊 Server started at ${new Date().toLocaleString()}`);
  console.log(`🎯 Configured for ${MAX_CONNECTIONS} concurrent connections`);
  console.log(`⚡ Performance monitoring active`);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});