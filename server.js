const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "public")));

// ---------------------- Utility Functions ----------------------

// Random nickname
function randomName() {
  const adjectives = [
    "Silent", "Wild", "Happy", "Crazy", "Mysterious", "Swift", "Noble", "Brave",
    "Clever", "Gentle", "Fierce", "Wise", "Bold", "Quick", "Calm", "Bright"
  ];
  const animals = [
    "Dragon", "Tiger", "Panda", "Wolf", "Eagle", "Shark", "Lion", "Fox",
    "Bear", "Hawk", "Deer", "Owl", "Lynx", "Raven", "Phoenix", "Jaguar"
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return adj + animal;
}

// Random avatar (from /public/avatars)
function randomAvatar() {
  const avatars = [
    "/avatars/avatar1.png",
    "/avatars/avatar2.png",
    "/avatars/avatar3.png",
    "/avatars/avatar4.png",
    "/avatars/avatar5.png",
    "/avatars/avatar6.png",
    "/avatars/avatar7.png"
  ];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// ---------------------- Room Chat Management ----------------------

const rooms = new Map();

function getRoomInfo(roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, {
      users: new Set(),
      created: Date.now(),
      lastActivity: Date.now()
    });
  }
  return rooms.get(roomName);
}

function addUserToRoom(socket, roomName) {
  const roomInfo = getRoomInfo(roomName);
  roomInfo.users.add(socket.id);
  roomInfo.lastActivity = Date.now();
  socket.join(roomName);
  socket.room = roomName;

  io.to(roomName).emit("roomUpdate", {
    userCount: roomInfo.users.size,
    roomName: roomName
  });
}

function removeUserFromRoom(socket) {
  if (socket.room) {
    const roomInfo = rooms.get(socket.room);
    if (roomInfo) {
      roomInfo.users.delete(socket.id);
      roomInfo.lastActivity = Date.now();

      io.to(socket.room).emit("roomUpdate", {
        userCount: roomInfo.users.size,
        roomName: socket.room
      });

      if (roomInfo.users.size === 0) {
        setTimeout(() => {
          const currentRoomInfo = rooms.get(socket.room);
          if (currentRoomInfo && currentRoomInfo.users.size === 0) {
            rooms.delete(socket.room);
          }
        }, 5 * 60 * 1000);
      }
    }
  }
}

// ---------------------- Typing Indicators ----------------------

const typingUsers = new Map();

// ---------------------- 1v1 Queue System ----------------------

const waitingQueue = [];
const activePairs = new Map();
let pairCounter = 0;

function addToQueue(socket, nickname, avatar) {
  const queueUser = { socketId: socket.id, nickname, avatar, joinTime: Date.now() };
  waitingQueue.push(queueUser);

  socket.emit("queueStatus", {
    position: waitingQueue.length,
    message: "Looking for a partner..."
  });

  console.log(`🔍 ${nickname} joined 1v1 queue. Queue length: ${waitingQueue.length}`);
  matchUsers();
}

function matchUsers() {
  if (waitingQueue.length >= 2) {
    const user1 = waitingQueue.shift();
    const user2 = waitingQueue.shift();

    const roomId = `pair_${++pairCounter}_${Date.now()}`;

    activePairs.set(user1.socketId, {
      roomId,
      partnerId: user2.socketId,
      partnerName: user2.nickname,
      partnerAvatar: user2.avatar
    });
    activePairs.set(user2.socketId, {
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
  updateQueuePositions();
}

function updateQueuePositions() {
  waitingQueue.forEach((user, index) => {
    const socket = io.sockets.sockets.get(user.socketId);
    if (socket) {
      socket.emit("queueStatus", {
        position: index + 1,
        message: index === 0 ? "You're next in line!" : `Position ${index + 1} in queue`
      });
    }
  });
}

function removeFromQueue(socketId) {
  const index = waitingQueue.findIndex(user => user.socketId === socketId);
  if (index !== -1) {
    const removed = waitingQueue.splice(index, 1)[0];
    console.log(`❌ Removed ${removed.nickname} from 1v1 queue`);
    updateQueuePositions();
    return true;
  }
  return false;
}

function handlePairDisconnection(socket) {
  const pairInfo = activePairs.get(socket.id);

  if (pairInfo) {
    const partnerSocket = io.sockets.sockets.get(pairInfo.partnerId);

    if (partnerSocket) {
      partnerSocket.emit("partnerDisconnected", {
        partnerName: socket.nickname || "Your partner"
      });

      partnerSocket.leave(pairInfo.roomId);
      partnerSocket.room = null;

      addToQueue(partnerSocket, partnerSocket.nickname, partnerSocket.avatar);
    }

    activePairs.delete(socket.id);
    activePairs.delete(pairInfo.partnerId);

    console.log(`💔 Pair disconnected in room ${pairInfo.roomId}`);
  }
}

// ---------------------- Socket.IO Logic ----------------------

io.on("connection", (socket) => {
  const nickname = randomName();
  const avatar = randomAvatar();

  socket.nickname = nickname;
  socket.avatar = avatar;

  console.log(`🔗 ${nickname} connected (${socket.id})`);
  socket.emit("welcome", { nickname, avatar });

  // ----- Mode Join -----
  socket.on("joinMode", (mode, param) => {
    let roomName = "";

    if (mode === "random") {
      roomName = "random";
    } else if (mode === "room") {
      roomName = `room_${param}`;
    } else if (mode === "interest") {
      roomName = `interest_${param}`;
    }

    addUserToRoom(socket, roomName);

    io.to(socket.room).emit("chat message", {
      nickname: "System",
      avatar: "",
      msg: `${nickname} joined the chat`,
      timestamp: Date.now(),
      type: "system"
    });

    console.log(`📥 ${nickname} joined ${socket.room}`);
  });

  // ----- Chat Message -----
  socket.on("chat message", (msg) => {
    if (socket.room && msg.trim().length > 0) {
      const filteredMsg = msg.substring(0, 500);
      const roomInfo = getRoomInfo(socket.room);
      roomInfo.lastActivity = Date.now();

      io.to(socket.room).emit("chat message", {
        nickname,
        avatar,
        msg: filteredMsg,
        timestamp: Date.now(),
        type: "user"
      });

      console.log(`💬 ${nickname} in ${socket.room}: ${filteredMsg}`);
    }
  });

  // ----- Typing -----
  socket.on("typing", () => {
    if (socket.room) {
      if (!typingUsers.has(socket.room)) {
        typingUsers.set(socket.room, new Set());
      }
      typingUsers.get(socket.room).add(nickname);

      socket.to(socket.room).emit("typing", nickname);

      setTimeout(() => {
        const roomTyping = typingUsers.get(socket.room);
        if (roomTyping) {
          roomTyping.delete(nickname);
          if (roomTyping.size === 0) typingUsers.delete(socket.room);
        }
        socket.to(socket.room).emit("stopTyping", nickname);
      }, 3000);
    }
  });

  socket.on("stopTyping", () => {
    if (socket.room) {
      const roomTyping = typingUsers.get(socket.room);
      if (roomTyping) {
        roomTyping.delete(nickname);
        if (roomTyping.size === 0) typingUsers.delete(socket.room);
      }
      socket.to(socket.room).emit("stopTyping", nickname);
    }
  });

  // ----- 1v1 Mode -----
  socket.on("join1v1", () => {
    console.log(`🎯 ${nickname} wants to join 1v1 mode`);
    addToQueue(socket, nickname, avatar);
  });

  socket.on("leave1v1", () => {
    const wasInQueue = removeFromQueue(socket.id);
    if (activePairs.has(socket.id)) {
      handlePairDisconnection(socket);
    }
    console.log(`👋 ${nickname} left 1v1 mode`);
  });

  // ----- Disconnect -----
  socket.on("disconnect", () => {
    console.log(`🔌 ${nickname} disconnected (${socket.id})`);

    removeFromQueue(socket.id);
    if (activePairs.has(socket.id)) {
      handlePairDisconnection(socket);
    }

    if (socket.room) {
      const roomTyping = typingUsers.get(socket.room);
      if (roomTyping) {
        roomTyping.delete(nickname);
        if (roomTyping.size === 0) typingUsers.delete(socket.room);
      }

      io.to(socket.room).emit("chat message", {
        nickname: "System",
        avatar: "",
        msg: `${nickname} left the chat`,
        timestamp: Date.now(),
        type: "system"
      });

      removeUserFromRoom(socket);
    }
  });

  // Heartbeat
  socket.on("ping", () => {
    socket.emit("pong");
  });
});

// ---------------------- Cleanup ----------------------

setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [roomName, roomInfo] of rooms.entries()) {
    if (now - roomInfo.lastActivity > oneHour && roomInfo.users.size === 0) {
      rooms.delete(roomName);
      console.log(`🧹 Cleaned up inactive room: ${roomName}`);
    }
  }
}, 60 * 60 * 1000);

// ---------------------- API ----------------------

app.get("/api/stats", (req, res) => {
  const stats = {
    totalRooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce((sum, room) => sum + room.users.size, 0),
    uptime: process.uptime(),
    timestamp: Date.now()
  };
  res.json(stats);
});

// ---------------------- Start Server ----------------------

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Hideout Chat Server running on port ${PORT}`);
  console.log(`📊 Server started at ${new Date().toLocaleString()}`);
});
