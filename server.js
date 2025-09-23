// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public" folder
app.use(express.static("public"));

// Fun nickname generator
const adjectives = ["Silent", "Mysterious", "Crazy", "Shadow", "Swift", "Angry", "Happy", "Wild", "Gentle", "Dark"];
const animals = ["Tiger", "Wolf", "Dragon", "Eagle", "Fox", "Bear", "Panther", "Shark", "Hawk", "Owl"];

function generateNickname() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(Math.random() * 1000);
  return `${adj}${animal}${number}`;
}

// Handle socket connections
io.on("connection", (socket) => {
  const userNickname = generateNickname();
  console.log(`✅ ${userNickname} connected`);

  // Send nickname to client
  socket.emit("set nickname", userNickname);

  // Handle chat messages
  socket.on("chat message", (msg) => {
    io.emit("chat message", { user: userNickname, text: msg });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`❌ ${userNickname} disconnected`);
  });
});

// Use Railway dynamic port
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
