const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// Nickname + DP generator
function randomName() {
  const adjectives = ["Silent", "Wild", "Happy", "Crazy", "Mysterious", "Swift"];
  const animals = ["Dragon", "Tiger", "Panda", "Wolf", "Eagle", "Shark"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return adj + animal;
}

function randomDP(nickname) {
  return `https://api.multiavatar.com/${nickname}.png`; // MULTIAVATAR API
}

io.on("connection", (socket) => {
  const nickname = randomName();
  const avatar = randomDP(nickname);

  socket.emit("welcome", { nickname, avatar });

  socket.on("joinMode", (mode, param) => {
    if (mode === "random") {
      socket.join("random");
    } else if (mode === "room") {
      socket.join(param); // param = room code
    } else if (mode === "interest") {
      socket.join(param); // param = interest name
    }
    socket.room = param || mode;
    io.to(socket.room).emit("chat message", {
      nickname: "System",
      avatar: "",
      msg: `${nickname} joined ${socket.room}`,
    });
  });

  socket.on("chat message", (msg) => {
    io.to(socket.room).emit("chat message", {
      nickname,
      avatar,
      msg,
    });
  });

  socket.on("typing", () => {
    if (socket.room) socket.to(socket.room).emit("typing", nickname);
  });

  socket.on("stopTyping", () => {
    if (socket.room) socket.to(socket.room).emit("stopTyping", nickname);
  });

  socket.on("disconnect", () => {
    if (socket.room) {
      io.to(socket.room).emit("chat message", {
        nickname: "System",
        avatar: "",
        msg: `${nickname} left the room.`,
      });
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
