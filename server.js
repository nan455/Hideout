const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

function randomName() {
  const adjectives = ["Silent", "Wild", "Happy", "Crazy", "Mysterious", "Swift"];
  const animals = ["Dragon", "Tiger", "Panda", "Wolf", "Eagle", "Shark"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return adj + animal;
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

io.on("connection", (socket) => {
  const nickname = randomName();
  const avatar = randomAvatar();

  socket.emit("welcome", { nickname, avatar });

  socket.on("joinMode", (mode, param) => {
    if (mode === "random") {
      socket.join("random");
      socket.room = "random";
    } else if (mode === "room") {
      socket.join(param);
      socket.room = param;
    } else if (mode === "interest") {
      socket.join(param);
      socket.room = param;
    }

    io.to(socket.room).emit("chat message", {
      nickname: "System",
      avatar: "",
      msg: `${nickname} joined ${socket.room}`,
    });
  });

  socket.on("chat message", (msg) => {
    if (socket.room) {
      io.to(socket.room).emit("chat message", {
        nickname,
        avatar,
        msg,
      });
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