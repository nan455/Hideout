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
app.use("/avatars", express.static(path.join(__dirname, "avatars"))); // Serve avatars

// -------------------- CONFIG --------------------
const oneHour = 60 * 60 * 1000; // 1 hour in ms

// -------------------- HELPERS --------------------
function randomName() {
  const adjectives = [
    "Silent", "Wild", "Happy", "Crazy", "Mysterious", "Swift", "Noble", "Brave", 
    "Clever", "Gentle", "Fierce", "Wise", "Bold", "Quick", "Calm", "Bright"
  ];
  const animals = [
    "Dragon", "Tiger", "Panda", "Wolf", "Eagle", "Shark", "Lion", "Fox", 
    "Bear", "Hawk", "Deer", "Owl", "Lynx", "Raven", "Phoenix", "Jaguar"
  ];
  return adjectives[Math.floor(Math.random() * adjectives.length)] +
         animals[Math.floor(Math.random() * animals.length)];
}

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

// -------------------- ROOM MANAGEMENT --------------------
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
            console.log(`🧹 Cleaned up empty room: ${socket.room}`);
          }
        }, 5 * 60 * 1000);
      }
    }
  }
}

// -------------------- TYPING MANAGEMENT --------------------
const typingUsers = new Map();

// -------------------- SOCKET.IO CONNECTION --------------------
io.on("connection", (socket) => {
  const nickname = randomName();
  const avatar = randomAvatar();

  console.log(`🔗 ${nickname} connected (${socket.id})`);

  socket.emit("welcome", { nickname, avatar });

  socket.on("joinMode", (mode, param) => {
    let roomName = "";
    if (mode === "random") roomName = "random";
    else if (mode === "room") roomName = `room_${param}`;
    else if (mode === "interest") roomName = `interest_${param}`;

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

  socket.on("typing", () => {
    if (socket.room) {
      if (!typingUsers.has(socket.room)) typingUsers.set(socket.room, new Set());
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

  socket.on("disconnect", () => {
    console.log(`🔌 ${nickname} disconnected (${socket.id})`);

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

  socket.on("ping", () => {
    socket.emit("pong");
  });
});

// -------------------- CLEANUP --------------------
setInterval(() => {
  const now = Date.now();
  for (const [roomName, roomInfo] of rooms.entries()) {
    if (now - roomInfo.lastActivity > oneHour && roomInfo.users.size === 0) {
      rooms.delete(roomName);
      console.log(`🧹 Cleaned up inactive room: ${roomName}`);
    }
  }
}, oneHour);

// -------------------- API STATS --------------------
app.get("/api/stats", (req, res) => {
  const stats = {
    totalRooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce((sum, room) => sum + room.users.size, 0),
    uptime: process.uptime(),
    timestamp: Date.now()
  };
  res.json(stats);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Hideout Chat Server running on port ${PORT}`);
});
