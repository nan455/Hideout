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
    "/avatars/avatar6.png"
  ];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

let oneVsOneRooms = [];

io.on("connection", (socket) => {
  const nickname = randomName();
  const avatar = randomAvatar();

  console.log(`${nickname} connected`);

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
    } else if (mode === "1v1") {
      let roomFound = false;

      for (let r of oneVsOneRooms) {
        const clients = io.sockets.adapter.rooms.get(r) || new Set();
        if (clients.size < 2) {
          socket.join(r);
          socket.room = r;
          roomFound = true;

          if (clients.size + 1 === 2) {
            io.to(r).emit("paired");
          }
          break;
        }
      }

      if (!roomFound) {
        const newRoom = `1v1_${Date.now()}`;
        oneVsOneRooms.push(newRoom);
        socket.join(newRoom);
        socket.room = newRoom;
      }
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

  socket.on("leave1v1", () => {
    if (socket.room && socket.room.startsWith("1v1_")) {
      socket.leave(socket.room);
      const clients = io.sockets.adapter.rooms.get(socket.room);
      if (!clients || clients.size === 0) {
        oneVsOneRooms = oneVsOneRooms.filter(r => r !== socket.room);
      }
      socket.room = null;
    }
  });

  socket.on("disconnect", () => {
    console.log(`${nickname} disconnected`);
    if (socket.room) {
      io.to(socket.room).emit("chat message", {
        nickname: "System",
        avatar: "",
        msg: `${nickname} left the room.`,
      });
      const clients = io.sockets.adapter.rooms.get(socket.room);
      if (!clients || clients.size === 0 && socket.room.startsWith("1v1_")) {
        oneVsOneRooms = oneVsOneRooms.filter(r => r !== socket.room);
      }
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
